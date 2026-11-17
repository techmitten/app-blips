// Voice input's speech-to-text: Whisper (base, multilingual) running in this
// worker through transformers.js and ONNX Runtime's WebAssembly backend, so
// the recording is transcribed on this computer and never uploaded. A worker
// keeps the UI responsive while the model downloads, loads and runs.
//
// The model isn't bundled with AppBlips (src/lib/whisperModel.js). It's
// downloaded only on a 'download' message, which the app sends after the user
// agrees; 'load' and 'transcribe' use kept files and never go online. Every
// downloaded file is checked against its pinned SHA-256 before it's used or
// kept. transformers.js itself never goes online: it reads the verified files
// through `env.customCache`, and remote loading stays off.
import { env, pipeline } from '@huggingface/transformers';
import { CACHE_NAME, CACHE_PREFIX, MODEL_FILES, MODEL_TOTAL_BYTES, modelFileUrl } from './whisperModel';

const MODEL_NAME = 'whisper-base';

// transformers.js asks its cache for `${localModelPath}${MODEL_NAME}/<file>`;
// the custom cache below answers with the verified files. The path is never
// fetched for those files.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL('/whisper/models/', self.location.href).href;
env.useBrowserCache = false;
// transformers.js points ONNX Runtime at a CDN copy of its .wasm. Without
// that, ONNX Runtime loads the copy Vite already emits into assets/.
delete env.backends.onnx.wasm.wasmPaths;
// The app isn't cross-origin isolated, so there's no SharedArrayBuffer for
// threads; asking for one thread skips ONNX Runtime's failed attempt.
env.backends.onnx.wasm.numThreads = 1;

class ModelDownloadError extends Error {
  constructor(message, code = 'download') {
    super(message);
    this.code = code;
  }
}

const toHex = (buffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');

// Cache Storage can be missing (an unusual browser, private mode) or refuse
// to open; voice input still works, it just downloads again next session.
async function openCache() {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

// Drops copies of earlier model revisions once this one is in place.
async function removeOldCaches() {
  try {
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
    }
  } catch { /* nothing to clean up */ }
}

async function download(name, onBytes) {
  const [size, hash] = MODEL_FILES[name];
  let response;
  try {
    response = await fetch(modelFileUrl(name));
  } catch {
    throw new ModelDownloadError(`Could not download ${name}`);
  }
  if (!response.ok || !response.body) throw new ModelDownloadError(`Could not download ${name}: HTTP ${response.status}`);
  const bytes = new Uint8Array(size);
  let offset = 0;
  const reader = response.body.getReader();
  for (;;) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch {
      throw new ModelDownloadError(`The download of ${name} was interrupted`);
    }
    if (chunk.done) break;
    if (offset + chunk.value.length > size) throw new ModelDownloadError(`${name} is larger than expected`);
    bytes.set(chunk.value, offset);
    offset += chunk.value.length;
    onBytes(chunk.value.length);
  }
  if (offset !== size) throw new ModelDownloadError(`${name} is incomplete`);
  if (toHex(await crypto.subtle.digest('SHA-256', bytes)) !== hash) {
    throw new ModelDownloadError(`${name} does not match its pinned sha256`);
  }
  return bytes;
}

// name -> verified Blob, for this session.
const modelFiles = new Map();

// Fills `modelFiles` from Cache Storage. With `allowDownload`, whatever is
// missing is downloaded (and kept), calling `onProgress(percent)` meanwhile;
// without it, a missing file is an error (code 'missing').
async function ensureModelFiles({ allowDownload, onProgress }) {
  const cache = await openCache();
  const missing = [];
  for (const name of Object.keys(MODEL_FILES)) {
    if (modelFiles.has(name)) continue;
    const cached = await cache?.match(modelFileUrl(name)).catch(() => undefined);
    const blob = await cached?.blob().catch(() => null);
    // Only verified files are kept, so a size check catches a partial entry.
    if (blob?.size === MODEL_FILES[name][0]) modelFiles.set(name, blob);
    else missing.push(name);
  }
  if (missing.length === 0) return;
  if (!allowDownload) throw new ModelDownloadError('The voice model has not been downloaded', 'missing');

  const needed = missing.reduce((sum, name) => sum + MODEL_FILES[name][0], 0);
  let received = MODEL_TOTAL_BYTES - needed;
  let lastPercent = -1;
  const report = () => {
    const percent = Math.floor((received / MODEL_TOTAL_BYTES) * 100);
    if (percent !== lastPercent) onProgress((lastPercent = percent));
  };
  report();
  for (const name of missing) {
    const bytes = await download(name, (n) => { received += n; report(); });
    const blob = new Blob([bytes]);
    modelFiles.set(name, blob);
    await cache?.put(modelFileUrl(name), new Response(blob)).catch(() => { /* kept for this session only */ });
  }
  await removeOldCaches();
}

const filePrefix = `${env.localModelPath}${MODEL_NAME}/`;
env.useCustomCache = true;
env.customCache = {
  async match(key) {
    const url = typeof key === 'string' ? key : key?.url;
    if (!url?.startsWith(filePrefix)) return undefined;
    const blob = modelFiles.get(url.slice(filePrefix.length));
    return blob ? new Response(blob) : undefined;
  },
  // The files are already kept, verified, under their own keys.
  async put() {},
};

let transcriberPromise = null;

function loadTranscriber({ allowDownload = false } = {}) {
  transcriberPromise ??= ensureModelFiles({
    allowDownload,
    onProgress: (progress) => self.postMessage({ type: 'progress', progress }),
  })
    .then(() => {
      self.postMessage({ type: 'progress', progress: null });
      return pipeline('automatic-speech-recognition', MODEL_NAME, { dtype: 'q8', device: 'wasm' });
    })
    .catch((err) => {
      // Let the next request try again rather than caching the failure.
      transcriberPromise = null;
      self.postMessage({ type: 'progress', progress: null });
      throw err;
    });
  return transcriberPromise;
}

async function transcribe(audio, language) {
  const transcriber = await loadTranscriber();
  // Whisper handles audio longer than its 30 s window in overlapping chunks.
  const options = { task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 };
  try {
    return await transcriber(audio, language ? { ...options, language } : options);
  } catch (err) {
    // A UI language Whisper doesn't know: let it detect the language itself.
    if (language && /is not supported/.test(String(err?.message))) return transcriber(audio, options);
    throw err;
  }
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'download' || type === 'load') {
      await loadTranscriber({ allowDownload: type === 'download' });
      self.postMessage({ id, type: 'ready' });
    } else if (type === 'transcribe') {
      const result = await transcribe(data.audio, data.language);
      const text = (Array.isArray(result) ? result.map((r) => r.text).join(' ') : result.text) || '';
      self.postMessage({ id, type: 'result', text: text.trim() });
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String(err?.message || err), code: err?.code });
  }
};
