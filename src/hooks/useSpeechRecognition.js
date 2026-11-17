import { useCallback, useEffect, useRef, useState } from 'react';
import { logError } from '../lib/errorLog';
import { isModelSaved } from '../lib/whisperModel';

// Speech-to-text with Whisper running on this computer (src/lib/whisperWorker.js).
// The Web Speech API this replaced sends audio to the browser vendor and has
// no service at all in Electron. Here the microphone is recorded until the
// user stops, then the whole clip is transcribed locally: nothing is uploaded,
// and it works the same in the desktop app and the browser version. The model
// isn't bundled: the first click asks the user (`downloadPrompt`), and the
// microphone only opens once the model is downloaded and kept.

const SAMPLE_RATE = 16000; // what Whisper expects
// Bounds memory (and transcription time) if the mic is left on.
const MAX_RECORDING_MS = 2 * 60 * 1000;
// People click stop while finishing their last word, and Bluetooth audio
// arrives a little late, so recording runs on this long after the click.
const STOP_TAIL_MS = 500;
// A newly opened mic can send silence at first: Bluetooth headsets switch to
// their headset profile (a second or two), and noise suppression settles.
// "Listening…" waits for real sound above this level, or this long at most.
const MIC_SIGNAL_LEVEL = 0.0002;
const MIC_WARMUP_TIMEOUT_MS = 3000;

const DOWNLOAD_FAILED = 'The voice model could not be downloaded. Check your internet connection and try again.';

const ERROR_MESSAGES = {
  NotAllowedError: 'Microphone access is blocked. Allow it in your system or browser settings to use voice input.',
  SecurityError: 'Microphone access is blocked. Allow it in your system or browser settings to use voice input.',
  NotFoundError: 'No microphone was found.',
  NotReadableError: 'The microphone is in use by another app.',
};

const isSupported = () => (
  typeof window !== 'undefined'
  && typeof Worker !== 'undefined'
  && typeof window.MediaRecorder !== 'undefined'
  && Boolean(navigator.mediaDevices?.getUserMedia)
);

// One worker for the whole app, created on first use and kept, so the model
// (a few seconds to load) is only loaded once per session.
let worker = null;
let nextRequestId = 1;
const pending = new Map();

// Whether the model is known to be kept on this device, so the mic can open
// without asking. Checked (isModelSaved) on the first click of a session.
let modelSaved = false;

// The model download's progress (0-100), or null when none is running; shared
// by every component using the hook.
let downloadProgress = null;
const progressListeners = new Set();
const setDownloadProgress = (progress) => {
  downloadProgress = progress;
  for (const listener of progressListeners) listener(progress);
};

function whisperRequest(message, transfer = []) {
  if (!worker) {
    worker = new Worker(new URL('../lib/whisperWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        setDownloadProgress(data.progress);
        return;
      }
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.type === 'error') request.reject(Object.assign(new Error(data.message), { code: data.code }));
      else request.resolve(data);
    };
    worker.onerror = (event) => {
      // A worker that fails to start answers nothing; fail everything waiting
      // and start a fresh one next time.
      const err = new Error(event.message || 'The voice model could not start.');
      for (const request of pending.values()) request.reject(err);
      pending.clear();
      setDownloadProgress(null);
      worker?.terminate();
      worker = null;
    };
  }
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...message, id }, transfer);
  });
}

// Resolves once `stream` carries sound (or after the timeout, or if the level
// can't be read), so the UI only says "Listening…" when it really is.
function waitForSignal(stream, isCancelled) {
  return new Promise((resolve) => {
    let context = null;
    let poll = null;
    const finish = () => {
      clearTimeout(timeout);
      clearInterval(poll);
      context?.close().catch(() => {});
      resolve();
    };
    const timeout = setTimeout(finish, MIC_WARMUP_TIMEOUT_MS);
    try {
      context = new AudioContext();
      const analyser = context.createAnalyser();
      context.createMediaStreamSource(stream).connect(analyser);
      context.resume().catch(() => {});
      const samples = new Float32Array(analyser.fftSize);
      poll = setInterval(() => {
        if (isCancelled()) return finish();
        analyser.getFloatTimeDomainData(samples);
        let peak = 0;
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
        if (peak > MIC_SIGNAL_LEVEL) finish();
      }, 50);
    } catch {
      finish();
    }
  });
}

async function decodeToMono16k(blob) {
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    // decodeAudioData resamples to the context's rate.
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    return buffer.getChannelData(0).slice();
  } finally {
    context.close().catch(() => {});
  }
}

// `onTranscript(text)` is called once per recording with the transcribed
// text, after the user stops (or the time limit is reached).
export default function useSpeechRecognition({ onTranscript }) {
  // The mic is open and recording, but no sound has arrived yet.
  const [starting, setStarting] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState(null);
  const [modelProgress, setModelProgress] = useState(downloadProgress);
  // The "download the voice model?" question is showing.
  const [downloadPrompt, setDownloadPrompt] = useState(false);
  // The model is downloading (and then loading) after the user agreed.
  const [downloading, setDownloading] = useState(false);
  // The download just finished; the user clicks the mic again to speak.
  const [modelReady, setModelReady] = useState(false);
  const sessionRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);
  const supported = isSupported();

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  });

  useEffect(() => {
    progressListeners.add(setModelProgress);
    return () => { progressListeners.delete(setModelProgress); };
  }, []);

  const releaseMic = (session) => {
    clearTimeout(session.timer);
    clearTimeout(session.tailTimer);
    session.stream?.getTracks().forEach((track) => track.stop());
  };

  // Drop the session without delivering anything further -- used when the
  // caller is about to overwrite the text (submit, manual edit, unmount).
  const cancel = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      session.cancelled = true;
      if (session.recorder?.state === 'recording') {
        try { session.recorder.stop(); } catch { /* already stopped */ }
      }
      releaseMic(session);
    }
    setStarting(false);
    setListening(false);
    setTranscribing(false);
    setModelReady(false);
  }, []);

  // Graceful stop: the recording is transcribed and delivered. It shows
  // "Transcribing…" at once but records STOP_TAIL_MS more, so the last word
  // isn't cut off.
  const stop = useCallback(() => {
    const session = sessionRef.current;
    const recorder = session?.recorder;
    if (recorder?.state !== 'recording' || session.stopping) return;
    session.stopping = true;
    setStarting(false);
    setListening(false);
    setTranscribing(true);
    session.tailTimer = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, STOP_TAIL_MS);
  }, []);

  // The user agreed to the download: fetch, verify and keep the model, then
  // load it. The mic stays closed until the user clicks it again.
  const downloadModel = useCallback(async () => {
    setDownloadPrompt(false);
    setError(null);
    setDownloading(true);
    try {
      await whisperRequest({ type: 'download' });
      modelSaved = true;
      setModelReady(true);
    } catch (err) {
      logError('Voice model download failed', err);
      setError(err?.code === 'download' ? DOWNLOAD_FAILED : 'The voice model could not start. Try again.');
    } finally {
      setDownloading(false);
    }
  }, []);

  const dismissDownload = useCallback(() => setDownloadPrompt(false), []);

  const start = useCallback(async () => {
    if (!isSupported() || sessionRef.current || downloading) return;
    setError(null);
    setModelReady(false);
    if (!modelSaved) {
      modelSaved = await isModelSaved();
      if (!modelSaved) {
        setDownloadPrompt(true);
        return;
      }
    }
    if (sessionRef.current) return;
    const session = { cancelled: false, chunks: [] };
    sessionRef.current = session;
    setStarting(true);
    // Start loading the kept model now, so it's ready by the time the user stops.
    whisperRequest({ type: 'load' }).catch(() => { /* reported when transcribing */ });

    try {
      session.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      if (session.cancelled) return;
      sessionRef.current = null;
      setStarting(false);
      setError(ERROR_MESSAGES[err?.name] || 'Voice input could not start. Try again.');
      return;
    }
    if (session.cancelled) {
      releaseMic(session);
      return;
    }

    const recorder = new MediaRecorder(session.stream);
    session.recorder = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) session.chunks.push(event.data);
    };
    recorder.onstop = async () => {
      releaseMic(session);
      if (session.cancelled) return;
      setStarting(false);
      setListening(false);
      if (session.chunks.length === 0) {
        sessionRef.current = null;
        setTranscribing(false);
        return;
      }
      setTranscribing(true);
      try {
        const audio = await decodeToMono16k(new Blob(session.chunks, { type: recorder.mimeType }));
        const language = (navigator.language || '').split('-')[0].toLowerCase() || undefined;
        const { text } = await whisperRequest({ type: 'transcribe', audio, language }, [audio.buffer]);
        if (!session.cancelled && text) onTranscriptRef.current?.(text);
      } catch (err) {
        logError('Voice input failed', err);
        if (err?.code === 'missing') {
          // The kept copy was cleared (e.g. by the browser to free space):
          // the next click asks to download it again.
          modelSaved = false;
          if (!session.cancelled) setError('The voice model is no longer on this device. Click the microphone to download it again.');
        } else if (!session.cancelled) {
          setError('Voice input could not understand that recording. Try again.');
        }
      } finally {
        if (sessionRef.current === session) {
          sessionRef.current = null;
          setTranscribing(false);
        }
      }
    };
    // Recording starts right away, so nothing said early is lost; the UI says
    // "Listening…" once sound arrives.
    recorder.start();
    session.timer = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, MAX_RECORDING_MS);
    await waitForSignal(session.stream, () => session.cancelled || session.stopping);
    if (sessionRef.current !== session || session.cancelled || session.stopping || recorder.state !== 'recording') return;
    setStarting(false);
    setListening(true);
  }, [downloading]);

  useEffect(() => cancel, [cancel]);

  // `starting`: the mic is opening (wait before speaking); `listening` once
  // sound arrives. `downloadPrompt`: ask before downloading; `downloadModel` / `dismissDownload`
  // answer it. `downloading` with `modelProgress` (0-100, or null) while the
  // model downloads; `modelReady` once it has, until the next click.
  return {
    supported, starting, listening, transcribing, error, start, stop, cancel,
    downloadPrompt, downloadModel, dismissDownload, downloading, modelProgress, modelReady,
  };
}
