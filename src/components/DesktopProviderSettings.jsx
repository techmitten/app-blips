import { ConfirmedLink } from './ExternalLinkConfirm';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Cpu, Gift, Eye, EyeOff, Loader2, CircleCheck, CircleAlert, TriangleAlert } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import ModelCombobox from './ModelCombobox';
import useProviderModels from '../hooks/useProviderModels';
import useAnchoredList from '../hooks/useAnchoredList';
import useTestCooldown from '../hooks/useTestCooldown';
import FreeSignInRow from './FreeSignInRow';
import { PROVIDER_LOGOS, ONBOARDING_PROVIDER_LOGOS } from './providerLogos';
import { SettingRow, FIELD_CLASS, SECONDARY_BUTTON } from './SettingControls';
import { ipcErrorMessage, providerApi, isDesktop, chooseFreeProvider, FREE_PROVIDER_ID, FREE_PROVIDER_LABEL } from '../lib/desktop';
import { requestModelText, CHAT_REASONING_EFFORT } from '../lib/llm';
import { logError } from '../lib/errorLog';
import { USER_PROVIDER_OPTIONS } from '../../electron/server/providers.js';

// Settings → AI. In the desktop app the key is saved in the main process,
// encrypted with the OS keychain (electron/providerStore.js); in the browser
// version AppBlips' own server keeps it (electron/server/keyFile.js). Either
// way it is attached to requests there, and the page only learns
// { id, model, hasKey }, so the key field is write-only: blank means "keep the
// saved key".
// Edits are a draft until Save; `guardRef` lets SettingsModal stop the user
// leaving with unsaved edits (see useProviderGuard there).

// Solid fields so they stand out from the tinted provider panel.
const INPUT_CLASS = `mt-1.5 ${FIELD_CLASS.replace('bg-transparent', 'bg-surface')}`;
function ProviderGlyph({ id, logos }) {
  if (id === FREE_PROVIDER_ID) return <Gift size={18} className="shrink-0" />;
  const Logo = logos[id];
  return Logo ? <span className="inline-flex shrink-0"><Logo size={18} /></span> : <Cpu size={18} className="shrink-0" />;
}

// A native <select> can't show logos, so this is a small listbox (same list
// styling and placement as the model picker) with each provider's logo.
function ProviderDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const [position, place] = useAnchoredList(wrapRef, listRef, open);
  const selected = options.find((o) => o.id === value) || null;
  const openList = () => {
    place();
    setActive(Math.max(0, options.findIndex((o) => o.id === value)));
    setOpen(true);
  };
  const choose = (option) => {
    if (option.id !== value) onChange(option.id);
    setOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (wrapRef.current?.contains(e.target) || listRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onKeyDown = (e) => {
    const last = options.length - 1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openList();
      setActive((i) => (e.key === 'ArrowDown' ? Math.min(last, i + 1) : Math.max(0, i - 1)));
    } else if (open && (e.key === 'Home' || e.key === 'End')) {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : last);
    } else if (open && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      choose(options[active]);
    } else if (open && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label="Provider"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`${INPUT_CLASS} flex items-center gap-2 text-left ${selected ? '' : 'text-slate-500'}`}
      >
        {selected && <ProviderGlyph id={selected.id} logos={PROVIDER_LOGOS} />}
        <span className="min-w-0 flex-1 truncate">{selected ? selected.label : 'Select a provider'}</span>
        <ChevronDown size={16} className="shrink-0 text-slate-400" />
      </button>
      {open && position && createPortal(
        <ul ref={listRef} id={listId} role="listbox" aria-label="Provider" className="model-combobox-list" style={{ position: 'fixed', ...position }} onMouseDown={(e) => e.preventDefault()}>
          {options.map((option, i) => (
            <li
              key={option.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={option.id === value}
              className={`model-combobox-option${i === active ? ' is-active' : ''}${option.id === value ? ' is-selected' : ''}`}
              onMouseMove={() => { if (i !== active) setActive(i); }}
              onClick={() => choose(option)}
            >
              <ProviderGlyph id={option.id} logos={ONBOARDING_PROVIDER_LOGOS} />
              <span className="model-combobox-text"><span className="model-combobox-label">{option.label}</span></span>
              {option.id === value && <Check size={14} className="model-combobox-check" />}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}

const providerLabel = (id) => (id === FREE_PROVIDER_ID ? FREE_PROVIDER_LABEL : USER_PROVIDER_OPTIONS.find((p) => p.id === id)?.label || id);
// Free is the choice in effect when the environment supplies AI and no
// provider of the user's own is switched on.
const usesFree = (info) => Boolean(info?.envConfigured && !info.enabled);
// No provider until one is chosen (as in onboarding), so an unset Settings → AI
// shows "Select a provider" rather than quietly defaulting to the first.
const EMPTY_DRAFT = { id: '', model: '', apiKey: '' };

export default function DesktopProviderSettings({ guardRef }) {
  const [saved, setSaved] = useState(null); // provider.get() result
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [showKey, setShowKey] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // A saved key is locked behind a confirm so a stray click or keypress
  // can't start overwriting it; `replaceKey` is set once the user agrees.
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [replaceKey, setReplaceKey] = useState(false);
  const keyInputRef = useRef(null);
  const [status, setStatus] = useState(null); // { kind: 'busy' | 'ok' | 'error', text }
  const testCooldown = useTestCooldown('ai');
  const isFree = draft.id === FREE_PROVIDER_ID;
  const modelList = useProviderModels({
    ...draft,
    // No provider (or Free): an empty id and key keep the list from loading for nothing.
    ...(draft.id && !isFree ? {} : { id: '', apiKey: '' }),
    hasSavedKey: Boolean(saved?.hasKey && saved.id === draft.id),
  });

  useEffect(() => {
    providerApi.get().then((info) => {
      setSaved(info);
      if (usesFree(info)) setDraft({ id: FREE_PROVIDER_ID, model: '', apiKey: '' });
      else if (info.id) setDraft({ id: info.id, model: info.model, apiKey: '' });
    }).catch((err) => {
      logError('Could not read the AI settings', err);
      setStatus({ kind: 'error', text: ipcErrorMessage(err) || 'Could not read the AI settings.' });
    });
  }, []);

  const update = (fields) => {
    // Another provider has its own saved key (or none), so ask again.
    if ('id' in fields) setReplaceKey(false);
    setDraft((d) => ({ ...d, ...fields }));
    setStatus(null);
  };

  const keepsSavedKey = Boolean(saved?.hasKey && saved.id === draft.id);
  // The field is empty and stands for the saved key.
  const showsSavedKey = keepsSavedKey && !draft.apiKey;
  const keyLocked = keepsSavedKey && !replaceKey;
  const askToReplace = () => { if (keyLocked) setConfirmReplace(true); };
  const allowReplace = () => {
    setConfirmReplace(false);
    setReplaceKey(true);
    // After the dialog unmounts, so focus lands back in the field.
    requestAnimationFrame(() => keyInputRef.current?.focus());
  };
  const complete = isFree || (draft.id && draft.model.trim() && (draft.apiKey.trim() || keepsSavedKey));
  const dirty = isFree
    ? Boolean(saved?.enabled)
    : !saved?.enabled || saved.id !== draft.id || saved.model !== draft.model.trim() || Boolean(draft.apiKey.trim());
  const active = saved?.enabled && saved.id && saved.model && saved.hasKey;
  // Anything typed that Save hasn't stored yet.
  const base = usesFree(saved) ? { id: FREE_PROVIDER_ID, model: '' } : saved?.id ? { id: saved.id, model: saved.model } : { id: '', model: '' };
  const unsaved = Boolean(saved) && (draft.id !== base.id || draft.model.trim() !== base.model || Boolean(draft.apiKey.trim()));

  const summary = !saved
    ? 'Loading…'
    : active
      ? `Using ${providerLabel(saved.id)} · ${saved.model}.`
      : saved.envConfigured
        ? 'Choose a provider with your own key to use it instead.'
        : 'Not set up yet. Choose a provider and coding model to start building.';

  // Returns whether it saved, for the leave-with-unsaved-changes dialog.
  const onSave = async () => {
    setStatus({ kind: 'busy', text: 'Saving…' });
    if (isFree) {
      try {
        await chooseFreeProvider();
        setSaved(await providerApi.get());
        setStatus({ kind: 'ok', text: 'Saved.' });
        return true;
      } catch (err) {
        logError('Could not switch to the Free AI option', err);
        setStatus({ kind: 'error', text: ipcErrorMessage(err) || 'Could not save.' });
        return false;
      }
    }
    try {
      const next = await providerApi.set({
        enabled: true,
        id: draft.id,
        model: draft.model.trim(),
        ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
      });
      setSaved((prev) => ({ ...prev, ...next }));
      setDraft((d) => ({ ...d, model: d.model.trim(), apiKey: '' }));
      setShowKey(false);
      setReplaceKey(false);
      setStatus({ kind: 'ok', text: 'Saved.' });
      return true;
    } catch (err) {
      logError(`Could not save the AI provider settings (${draft.id})`, err);
      setStatus({ kind: 'error', text: ipcErrorMessage(err) || 'Could not save.' });
      return false;
    }
  };

  useEffect(() => {
    if (!guardRef) return undefined;
    guardRef.current = { unsaved, complete: Boolean(complete), save: onSave };
    return () => { guardRef.current = null; };
  });

  // An empty apiKey reuses this provider’s saved key in desktop or browser mode.
  const onTest = async () => {
    if (testCooldown.secondsLeft) return;
    setStatus({ kind: 'busy', text: 'Testing…' });
    try {
      await requestModelText({
        messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
        askMode: true,
        // The same effort the app's own chat calls use. 'none' would ask
        // some models to switch thinking off, which always-thinking models
        // (e.g. Z.ai glm-5.3-flash) reject, failing a working setup.
        reasoningEffort: CHAT_REASONING_EFFORT,
        // Free is tested as saved (no provider of the user's own attached).
        ...(isFree ? {} : { userProvider: { id: draft.id, model: draft.model.trim(), apiKey: draft.apiKey.trim() } }),
        retry: false,
        standalone: true,
      });
      setStatus({ kind: 'ok', text: isFree ? 'Free AI is working.' : `Connected to ${providerLabel(draft.id)}.` });
    } catch (err) {
      logError(`AI provider test request failed (${draft.id}, ${draft.model.trim()})`, err);
      setStatus({ kind: 'error', text: err?.message || 'The test request failed.' });
    } finally {
      testCooldown.start();
    }
  };

  const onClear = async () => {
    setConfirmClear(false);
    try {
      const next = await providerApi.clear();
      setSaved((prev) => ({ ...prev, ...next }));
      setDraft(EMPTY_DRAFT);
      setShowKey(false);
      setReplaceKey(false);
      setStatus(null);
    } catch (err) {
      logError('Could not clear the AI provider settings', err);
      setStatus({ kind: 'error', text: ipcErrorMessage(err) || 'Could not clear.' });
    }
  };

  const busy = status?.kind === 'busy';

  return (
    <>
    <SettingRow
      id="set-desktop-provider"
      title="AI coding provider"
      description={summary}
      details={(
        // One panel split into sections (provider, key, model, actions) so the
        // fields read as groups rather than one long stack.
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.06] divide-y divide-slate-200 dark:divide-white/10">
          <div className="px-4 py-3.5 block text-sm font-medium text-slate-800">
            Provider
            <ProviderDropdown
              value={draft.id}
              onChange={(id) => update({ id, model: '', apiKey: '' })}
              options={[...(saved?.envConfigured ? [{ id: FREE_PROVIDER_ID, label: FREE_PROVIDER_LABEL }] : []), ...USER_PROVIDER_OPTIONS]}
            />
          </div>
          {isFree ? (<div className="px-4 py-3.5 space-y-3">
            <p className="text-xs text-slate-500 leading-snug">
              No key or model to choose. It may be slower or limited when busy; pick a provider with your own key for more control.
              {saved?.enabled && ' Saving switches off your own provider; its key stays saved.'}
            </p>
            {!isDesktop && saved?.freeSignIn && <FreeSignInRow />}
          </div>) : (<>
          <div className="px-4 py-3.5 space-y-1.5">
          <label className="block text-sm font-medium text-slate-800">
            {draft.id ? `${providerLabel(draft.id)} API key` : 'API key'}
            <div className="relative">
              <input
                ref={keyInputRef}
                type={showKey ? 'text' : 'password'}
                value={draft.apiKey}
                onChange={(e) => update({ apiKey: e.target.value })}
                readOnly={keyLocked}
                onClick={askToReplace}
                onPaste={(e) => { if (keyLocked) { e.preventDefault(); askToReplace(); } }}
                onKeyDown={(e) => {
                  // Typing, Enter or Space asks; Tab and shortcuts pass through.
                  if (!keyLocked || e.ctrlKey || e.metaKey || e.altKey) return;
                  if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete') {
                    e.preventDefault();
                    askToReplace();
                  }
                }}
                placeholder={keepsSavedKey ? 'Saved (encrypted) — type to replace' : draft.id ? `Your ${providerLabel(draft.id)} API key` : 'Your API key'}
                autoComplete="off"
                spellCheck={false}
                className={`${INPUT_CLASS} ${showsSavedKey ? '' : 'pr-11'} ${keyLocked ? 'cursor-pointer' : ''}`}
              />
              {/* The saved key never reaches the page, so there is nothing to
                  reveal: the eye only appears once a new key is typed. */}
              {!showsSavedKey && (
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute inset-y-0 right-0 mt-1.5 flex items-center px-3.5 text-slate-400 hover:text-slate-700 transition-colors"
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              )}
            </div>
          </label>
          <p className="text-xs text-slate-500 leading-snug">
            {isDesktop
              ? saved?.weakEncryption
                ? 'Your key is stored only on this computer, never in your projects. For extra protection, set up a system keyring such as GNOME Keyring or KWallet.'
                : 'Your key is encrypted with your system keychain and stored only on this computer, never in your projects.'
              : 'Your key is saved in this browser only and sent to AppBlips’ server with each request. It is never stored on the server or in your projects.'}
          </p>
          {['anthropic', 'openai', 'gemini', 'xai', 'deepseek'].includes(draft.id) && <p className="text-xs text-slate-500">
            <ConfirmedLink why="To sign in to your provider's account and create an API key. AppBlips needs a key to send your prompts to that provider." href={draft.id === 'gemini' ? 'https://aistudio.google.com/apikey' : draft.id === 'openai' ? 'https://platform.openai.com/api-keys' : draft.id === 'anthropic' ? 'https://platform.claude.com/settings/keys' : draft.id === 'xai' ? 'https://console.x.ai/team/default/api-keys' : 'https://platform.deepseek.com/api_keys'} >Create a {providerLabel(draft.id)} API key</ConfirmedLink>.
          </p>}
          </div>
          <div className="px-4 py-3.5 space-y-2">
          <label className="block text-sm font-medium text-slate-800">
            Model
            <ModelCombobox
              value={draft.model}
              onChange={(model) => update({ model })}
              models={modelList.models}
              loading={modelList.loading}
              allowCustom
              placeholder="Select a model or enter its ID…"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <button type="button" onClick={modelList.refresh} disabled={modelList.loading || modelList.needsKey} className={SECONDARY_BUTTON}>Refresh models</button>
            {modelList.needsKey && <span>Enter your API key to load models, or enter a model ID manually.</span>}
            {modelList.error && <span role="status">{modelList.error} Type a model ID to continue.</span>}
          </div>
          {draft.id === 'openai' && <p className="text-xs text-slate-500">
            Choose an OpenAI model that supports tool calling through Chat Completions.
          </p>}
          </div>
          </>)}
          <div className="px-4 py-3.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={!complete || !dirty || busy}
              className="brand-fill-text rounded-lg px-4 py-1.5 bg-brand text-white font-semibold text-sm hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onTest}
              disabled={!complete || busy || (isFree && dirty) || testCooldown.secondsLeft > 0}
              title={testCooldown.secondsLeft ? 'You can test again in a few seconds.' : undefined}
              className={SECONDARY_BUTTON}
            >
              {testCooldown.secondsLeft ? `Test again in ${testCooldown.secondsLeft}s` : 'Test connection'}
            </button>
            <button type="button" onClick={() => setConfirmClear(true)} disabled={!saved?.id || isFree || busy} className={SECONDARY_BUTTON}>
              Clear
            </button>
            {status && (
              <span
                role={status.kind === 'error' ? 'alert' : 'status'}
                className={`inline-flex items-center gap-1.5 text-xs ${status.kind === 'error' ? 'text-red-600' : status.kind === 'ok' ? 'text-emerald-600' : 'text-slate-500'}`}
              >
                {status.kind === 'busy' && <Loader2 size={14} className="animate-spin" />}
                {status.kind === 'ok' && <CircleCheck size={14} />}
                {status.kind === 'error' && <CircleAlert size={14} />}
                {status.text}
              </span>
            )}
          </div>
        </div>
      )}
    />
    {/* Portaled out of the settings card: a fixed overlay inside it would be
        clipped by the card's overflow. */}
    {confirmReplace && createPortal(
      <ConfirmModal
        title="Replace saved API key?"
        subtitle={`Your ${providerLabel(draft.id)} key is saved and encrypted.`}
        onClose={() => setConfirmReplace(false)}
        onConfirm={allowReplace}
        confirmLabel="Replace key"
        confirmClass="brand-fill-text rounded-lg px-5 py-2 font-semibold bg-brand text-white hover:bg-brand-hover transition-colors"
      >
        <p className="text-sm text-slate-600 leading-relaxed">
          You can type or paste a new key. The saved key keeps working until you click <strong>Save</strong>, and if you leave the box empty it isn't changed.
        </p>
      </ConfirmModal>,
      document.body,
    )}
    {confirmClear && createPortal(
      <ConfirmModal
        title="Clear AI provider?"
        subtitle="This removes your saved settings."
        onClose={() => setConfirmClear(false)}
        onConfirm={onClear}
        confirmLabel="Clear"
        confirmClass="inline-flex items-center gap-1.5 rounded-lg px-5 py-2 font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
      >
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-slate-600 leading-relaxed flex items-start gap-3">
          <TriangleAlert size={18} className="text-red-500 shrink-0 mt-0.5" />
          <span>
            Your saved provider, model and API key will be removed. You'll need to enter them again before you can build.
          </span>
        </div>
      </ConfirmModal>,
      document.body,
    )}
    </>
  );
}
