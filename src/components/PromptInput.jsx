import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, Paperclip, Camera, Send, Mic, Globe } from 'lucide-react';
import ImageLightbox from './ImageLightbox';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import ConfirmModal from './ConfirmModal';
import { MODEL_SIZE_LABEL } from '../lib/whisperModel';
import { matchSkillCommands } from '../lib/skills';

// Shown once the voice model has downloaded. The two halves take turns in one
// short line (the full sentence was too long for the composer's footer): the
// news first, then the next step, which stays until the mic is clicked.
// Screen readers get the whole sentence once.
const VOICE_READY_HANDOFF_MS = 2400;

function VoiceReadyLabel() {
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(true), VOICE_READY_HANDOFF_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <span role="status" className="voice-listening-label text-xs font-semibold text-slate-500 dark:text-slate-400">
      <span className="sr-only">Voice input is ready. Click the microphone to speak.</span>
      <span key={showHint ? 'hint' : 'ready'} aria-hidden="true" className="voice-ready-swap">
        {showHint ? 'Click the microphone' : 'Voice input is ready'}
      </span>
    </span>
  );
}

// Names for the web search tooltip, by provider id (lib/providerWeb.js).
const WEB_SEARCH_PROVIDERS = { deepseek: 'DeepSeek', anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini', xai: 'xAI', openrouter: 'OpenRouter' };

// Prompt textarea with its attach/voice/submit footer. Build/Ask lives in the
// build pane's header (ChatModeToggle).
// Desktop Enter sends; touch keyboards keep Enter for newlines. Cmd/Ctrl+Enter sends.
// The textarea auto-grows to a cap before scrolling.
export default function PromptInput({
  prompt,
  onPromptChange,
  onSubmit,
  onCancelGeneration,
  isGenerating,
  isChatActive,
  hasCode,
  chatMode,
  isClarifying,
  hasClarifyingChoices = false,
  studioMode = 'app',
  attachment = null,
  attachmentError = null,
  isCapturingScreenshot = false,
  onAttachScreenshot,
  onAttachFile,
  onRemoveAttachment,
  // Web search through the AI provider (lib/providerWeb.js): the globe is
  // shown only while the provider in use offers it, and stays on or off
  // until clicked again. `webSearchProvider` is its id, for the tooltip.
  webSearchAvailable = false,
  webSearchProvider = '',
  webSearch = false,
  onWebSearchChange,
  voiceInput = false,
  // Extra keys at the end of the footer's left group (the home page puts its
  // studio switch here). Omitted everywhere else.
  footerExtra = null,
}) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Optional microphone dictation (the first-build hero turns it on). Spoken
  // text is transcribed when the user stops, and appended after whatever was
  // already typed when listening began.
  const voiceBaseRef = useRef('');
  const {
    supported: voiceSupported, starting: voiceStarting, listening, transcribing, error: voiceError, start: startVoice, stop: stopVoice, cancel: cancelVoice,
    downloadPrompt, downloadModel, dismissDownload, downloading, modelProgress, modelReady,
  } = useSpeechRecognition({
    onTranscript: (text) => onPromptChange(voiceBaseRef.current + text.trim()),
  });
  // Sending mid-transcription would drop what the user just said.
  const canSubmit = !isGenerating && !transcribing && prompt.trim().length > 0;
  const showVoice = voiceInput && voiceSupported && !isGenerating;
  const toggleVoice = () => {
    if (listening) {
      stopVoice();
      return;
    }
    // Nothing has been heard yet, so there's nothing to transcribe.
    if (voiceStarting) {
      cancelVoice();
      return;
    }
    const typed = prompt.trimEnd();
    voiceBaseRef.current = typed ? `${typed} ` : '';
    startVoice();
  };
  // Anything that rewrites the prompt itself must end dictation first, or a
  // late transcript would overwrite the edit (or resurrect a sent prompt).
  const handleChange = (value) => {
    if (voiceStarting || listening || transcribing) cancelVoice();
    onPromptChange(value);
  };
  const submit = () => {
    cancelVoice();
    onSubmit();
  };

  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);

  useEffect(() => {
    const resize = () => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      const maxHeight = Math.min(176, parseFloat(getComputedStyle(el).maxHeight) || 176);
      el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
      el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
    };
    resize();
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
    };
  }, [prompt]);

  useEffect(() => {
    if (isClarifying && !hasClarifyingChoices && !isGenerating) {
      textareaRef.current?.focus();
    }
  }, [isClarifying, hasClarifyingChoices, isGenerating]);

  // Skill commands (lib/skills.js): typing "/" at the start of the prompt
  // lists the skills; Tab or Enter fills one in, Escape hides the list until
  // the prompt changes. Imported codebases have their own pipeline, without skills.
  const [commandIndex, setCommandIndex] = useState(0);
  const [commandsDismissedFor, setCommandsDismissedFor] = useState(null);
  const commandMatches = studioMode === 'codebase' || isGenerating || commandsDismissedFor === prompt ? [] : matchSkillCommands(prompt);
  const activeCommand = commandMatches[Math.min(commandIndex, commandMatches.length - 1)];
  const chooseCommand = (skill) => {
    handleChange(`/${skill.command} `);
    setCommandIndex(0);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (commandMatches.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setCommandIndex((index) => (Math.min(index, commandMatches.length - 1) + step + commandMatches.length) % commandMatches.length);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setCommandsDismissedFor(prompt);
        return;
      }
      // Enter on a command already typed in full sends it as it is.
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && prompt.slice(1).toLowerCase() !== activeCommand.command)) {
        e.preventDefault();
        chooseCommand(activeCommand);
        return;
      }
    }
    if (e.key === 'Enter' && !window.matchMedia('(pointer: coarse)').matches && !(e.shiftKey || e.metaKey || e.ctrlKey || e.altKey)) {
      e.preventDefault();
      if (canSubmit) submit();
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canSubmit) submit();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (file) onAttachFile?.(file);
  };

  // Ctrl/Cmd+V of a screenshot or copied image attaches it like the paperclip.
  // Plain text pastes fall through to the textarea untouched.
  const handlePaste = (e) => {
    if (!onAttachFile) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    // Clipboard screenshots arrive as a generic "image.png".
    const named = file.name && file.name !== 'image.png'
      ? file
      : new File([file], 'Pasted image', { type: file.type });
    onAttachFile(named);
  };

  // Builds only: Ask mode answers without searching.
  const showWebSearch = Boolean(webSearchAvailable && onWebSearchChange);
  const webSearchTitle = webSearch
    ? 'Web search is on: the AI searches the web when a request needs real facts. Click to turn it off.'
    : `Let the AI search the web for real facts. Each search has a small cost on your ${WEB_SEARCH_PROVIDERS[webSearchProvider] || 'AI provider'} key, usually about a cent or less.`;

  const showAttach = Boolean(onAttachFile);
  const showScreenshot = Boolean(hasCode && onAttachScreenshot);

  const isWebsite = studioMode === 'website';
  const noun = isWebsite ? 'Website' : studioMode === 'game' ? 'Game' : studioMode === 'codebase' ? 'Site' : 'App';

  const submitLabel = isGenerating
    ? (chatMode === 'ask' ? 'Thinking...' : (isClarifying ? 'Answering...' : (hasCode ? `Updating ${noun}...` : `Building ${noun}...`)))
    : (chatMode === 'ask' ? 'Send' : (isClarifying ? 'Answer' : (isChatActive ? `Update ${noun}` : `Build ${noun}`)));

  return (
    <div data-tour="prompt" className={`prompt-input-dock${isGenerating && chatMode !== 'ask' ? ' is-building' : ''} relative bg-white dark:bg-[#161824] rounded-2xl border-2 border-slate-400 dark:border-white/20 overflow-hidden transition-all shadow-md flex flex-col`}>
      {attachment && (
        <div className="flex items-center gap-2 px-3 sm:px-4 pt-3">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsAttachmentOpen(true)}
              aria-label="View attached image full size"
              title="View full size"
              className="block cursor-zoom-in"
            >
              <img
                src={attachment.dataUrl}
                alt={attachment.name || 'Attached image'}
                className="w-11 h-11 rounded-lg object-cover border-2 border-slate-300 dark:border-white/20 shadow-2xs"
              />
            </button>
            <button
              type="button"
              onClick={onRemoveAttachment}
              aria-label="Remove attached image"
              title="Remove attached image"
              className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-4.5 h-4.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-md cursor-pointer"
            >
              <X size={10} strokeWidth={3} />
            </button>
          </div>
          <span className="text-xs font-semibold text-slate-600 dark:text-white/60 truncate">
            {attachment.name || 'Attached image'}
          </span>
        </div>
      )}
      {attachment && isAttachmentOpen && (
        <ImageLightbox
          src={attachment.dataUrl}
          alt={attachment.name || 'Attached image'}
          onClose={() => setIsAttachmentOpen(false)}
        />
      )}
      {attachmentError && (
        <p className="px-3 sm:px-4 pt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{attachmentError}</p>
      )}
      {voiceError && (
        <p role="alert" className="px-3 sm:px-4 pt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{voiceError}</p>
      )}
      {commandMatches.length > 0 && (
        <ul
          id="prompt-skill-commands"
          role="listbox"
          aria-label="Skills"
          className="mx-3 sm:mx-3.5 mt-3 rounded-xl border border-slate-200 bg-slate-50 p-1"
        >
          {commandMatches.map((skill) => {
            const active = skill === activeCommand;
            return (
              <li
                key={skill.id}
                id={`prompt-skill-${skill.id}`}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => chooseCommand(skill)}
                className={`flex cursor-pointer items-baseline gap-2 rounded-lg px-2.5 py-1.5 text-sm ${active ? 'bg-indigo-500/10' : 'hover:bg-slate-100'}`}
              >
                <span className="font-semibold text-indigo-600">/{skill.command}</span>
                <span className="min-w-0 truncate text-xs text-slate-600">{skill.hint}{skill.isEnabled() ? '' : ' (off in Settings → Skills)'}</span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="relative">
        <textarea
          ref={textareaRef}
          id="prompt"
          name="prompt"
          value={prompt}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          aria-controls={commandMatches.length ? 'prompt-skill-commands' : undefined}
          aria-activedescendant={activeCommand ? `prompt-skill-${activeCommand.id}` : undefined}
          placeholder={
            isClarifying
              ? "Type your answer…"
              // Before the first message (the home page) every studio and
              // mode shares one short line, so switching changes nothing.
              : !isChatActive
                ? "Describe your idea…"
                : chatMode === 'ask'
                  ? "Ask a question about the code…"
                  : isWebsite
                    ? "e.g. Change the hero photo, add a pricing section…"
                    : studioMode === 'game'
                      ? "e.g. Add a boss level, make the ball faster…"
                      : "e.g. Make the background dark, add a reset button…"
          }
          className={`prompt-input-field w-full min-h-14 sm:min-h-16.5 max-h-40 px-5 pt-4 pb-2 outline-none resize-none text-slate-950 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 text-sm font-medium leading-relaxed bg-transparent custom-scrollbar`}
          disabled={isGenerating}
        />
      </div>
      <div className="prompt-input-footer flex items-end justify-between gap-2 px-3 sm:px-3.5 pb-3 pt-1.5">
        {/* On a narrow screen the left keys wrap among themselves, so mic and
            send stay at the end of the last row instead of on a row alone. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
          {!isGenerating ? (
            <>
              {onAttachFile && (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              )}
              {(showAttach || showScreenshot || showWebSearch) && (
              <div className="prompt-input-mode">
                {showAttach && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach an image from your device"
                  title="Attach an image from your device"
                  className="chat-mode-option min-w-(--composer-key-size)! p-0!"
                >
                  <Paperclip size={18} aria-hidden="true" />
                </button>
                )}
                {showScreenshot && (
                  <button
                    type="button"
                    onClick={onAttachScreenshot}
                    disabled={isCapturingScreenshot}
                    aria-label={isCapturingScreenshot ? 'Capturing preview screenshot...' : 'Attach a screenshot of the preview'}
                    title={isCapturingScreenshot ? 'Capturing preview screenshot...' : 'Attach a screenshot of the preview'}
                    className="chat-mode-option min-w-(--composer-key-size)! p-0!"
                  >
                    {isCapturingScreenshot ? <Loader2 className="animate-spin" size={18} /> : <Camera size={18} aria-hidden="true" />}
                  </button>
                )}
                {showWebSearch && (
                  <button
                    type="button"
                    onClick={() => onWebSearchChange(!webSearch)}
                    aria-pressed={webSearch}
                    aria-label={webSearchTitle}
                    title={webSearchTitle}
                    className="chat-mode-option prompt-web-search min-w-(--composer-key-size)! p-0!"
                  >
                    <Globe size={18} aria-hidden="true" />
                  </button>
                )}
              </div>
              )}
            </>
          ) : null}
          {footerExtra}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {isGenerating && (
            <button
              onClick={onCancelGeneration}
              className="prompt-input-cancel composer-key composer-key-danger rounded-full!"
              aria-label="Cancel"
              title="Cancel"
            >
              <X size={18} />
            </button>
          )}
          {showVoice && (
            <>
              {voiceStarting && (
                <span role="status" className="voice-listening-label text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Starting microphone…
                </span>
              )}
              {listening && (
                <span role="status" className="voice-listening-label text-xs font-semibold text-rose-500 dark:text-rose-400">
                  Listening…
                </span>
              )}
              {transcribing && (
                <span role="status" className="voice-listening-label text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Transcribing…
                </span>
              )}
              {downloading && (
                <span role="status" className="voice-listening-label text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {modelProgress != null ? `Downloading voice model… ${modelProgress}%` : 'Preparing voice input…'}
                </span>
              )}
              {modelReady && <VoiceReadyLabel />}
              <button
                type="button"
                onClick={toggleVoice}
                disabled={transcribing || downloading}
                aria-pressed={listening || voiceStarting}
                aria-label={listening ? 'Stop voice input' : voiceStarting ? 'Cancel voice input' : transcribing ? 'Transcribing voice input' : downloading ? 'Downloading the voice model' : 'Start voice input'}
                title={listening ? 'Stop voice input' : voiceStarting ? 'Starting the microphone… Click to cancel.' : transcribing ? 'Transcribing…' : downloading ? 'Downloading the voice model…' : 'Speak your prompt'}
                className={`composer-key rounded-full! ${listening ? 'composer-key-danger voice-listening' : ''}`}
              >
                {transcribing || downloading ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
              </button>
            </>
          )}
          <button
            onClick={submit}
            disabled={!canSubmit}
            aria-label={submitLabel}
            title={submitLabel}
            className="prompt-input-action composer-key prompt-input-send rounded-full!"
          >
            {isGenerating ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
      </div>
      {/* Portaled: the composer's own styling would otherwise contain a fixed overlay. */}
      {downloadPrompt && createPortal(
        <ConfirmModal
          title="Download the voice model?"
          subtitle={`A one-time download of ${MODEL_SIZE_LABEL}`}
          onClose={dismissDownload}
          onConfirm={downloadModel}
          confirmLabel="Download"
          cancelLabel="Not now"
          confirmClass="brand-fill-text rounded-lg px-5 py-2 font-semibold bg-brand text-white hover:bg-brand-hover transition-colors"
        >
          <p className="text-sm text-slate-600 leading-relaxed">
            Voice input uses Whisper, an open-source speech recognition model, to turn your speech into text. To use it, AppBlips needs to download the model from Hugging Face. This happens only once.
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            After the download, your recordings are transcribed on this device and are never uploaded.
          </p>
        </ConfirmModal>,
        document.body,
      )}
    </div>
  );
}
