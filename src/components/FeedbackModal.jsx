import { useEffect, useRef, useState } from 'react';
import {
  Bug, CircleAlert, Lightbulb, Heart, MessageCircle, MessageSquareHeart, Send,
} from 'lucide-react';
import Modal, { ModalCloseButton } from './Modal';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './SettingControls';
import {
  FEEDBACK_TYPES, MAX_FEEDBACK_LENGTH, sendFeedback, validateFeedback,
} from '../lib/feedback';

const LABEL_CLASS = 'block text-sm font-semibold text-slate-900';
const INPUT_CLASS = 'w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-indigo-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

const PRIVACY_URL = 'https://www.appblips.com/privacy';
const WEB3FORMS_PRIVACY_URL = 'https://web3forms.com/privacy';
const LINK_CLASS = 'font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-700';

// One icon and theme-aware tint per feedback type, in the same order as FEEDBACK_TYPES.
const TYPE_STYLES = {
  Idea: {
    Icon: Lightbulb,
    selected: 'border-amber-400/80 bg-amber-50/80 text-slate-900 shadow-xs ring-1 ring-amber-400/25',
    icon: 'text-amber-600',
    idleIcon: 'text-amber-500/80 group-hover:text-amber-600',
  },
  Problem: {
    Icon: Bug,
    selected: 'border-rose-400/80 bg-rose-50/80 text-slate-900 shadow-xs ring-1 ring-rose-400/25',
    icon: 'text-rose-600',
    idleIcon: 'text-rose-500/80 group-hover:text-rose-600',
  },
  Praise: {
    Icon: Heart,
    selected: 'border-emerald-400/80 bg-emerald-50/80 text-slate-900 shadow-xs ring-1 ring-emerald-400/25',
    icon: 'text-emerald-600',
    idleIcon: 'text-emerald-500/80 group-hover:text-emerald-600',
  },
  Other: {
    Icon: MessageCircle,
    selected: 'border-indigo-400/80 bg-indigo-50/80 text-slate-900 shadow-xs ring-1 ring-indigo-400/25',
    icon: 'text-indigo-600',
    idleIcon: 'text-indigo-500/80 group-hover:text-indigo-600',
  },
};

// "Send feedback", opened from the studio picker's top bar. Sends the message
// to the AppBlips team (lib/feedback.js). Escape closes only this dialog.
export default function FeedbackModal({ onClose }) {
  const [type, setType] = useState('Idea');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  // Bot protection (see lib/appblipsInbox.js): a honeypot people never see,
  // and when the form opened.
  const [botcheck, setBotcheck] = useState(false);
  const [openedAt] = useState(() => Date.now());
  // idle | sending | sent | error
  const [state, setState] = useState('idle');
  const [result, setResult] = useState('');
  const abortRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  // Closing mid-send drops the request instead of updating an unmounted dialog.
  useEffect(() => () => abortRef.current?.abort(), []);

  const submit = async (event) => {
    event.preventDefault();
    const problem = validateFeedback({ message, email });
    if (problem) {
      setState('error');
      setResult(problem);
      return;
    }
    setState('sending');
    setResult('');
    abortRef.current = new AbortController();
    const outcome = await sendFeedback(
      { type, message, email, botcheck, openedAt },
      { signal: abortRef.current.signal },
    );
    if (abortRef.current?.signal.aborted) return;
    setState(outcome.ok ? 'sent' : 'error');
    setResult(outcome.message);
  };

  const sending = state === 'sending';
  return (
    <Modal
      zIndex={70}
      cardClass="w-full max-w-md xl:max-w-lg bg-surface rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-scale-in flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]"
      cardProps={{ role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'feedback-title' }}
    >
      <div className="relative shrink-0 overflow-hidden px-6 py-5 bg-gradient-to-br from-indigo-50/90 via-indigo-50/35 to-transparent dark:from-[#ec6452]/12 dark:via-indigo-500/8 dark:to-transparent border-b border-indigo-100/80 dark:border-slate-200">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#1e598f] via-[#3987d0] to-[#ec6452]"
        />
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-[#ec6452]/12 dark:bg-[#ec6452]/18 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-8 -bottom-10 h-28 w-28 rounded-full bg-indigo-500/12 dark:bg-indigo-400/12 blur-2xl" />
        <div className="relative flex items-center gap-3.5">
          <span className="brand-mark flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white">
            <MessageSquareHeart size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="feedback-title" className="text-lg font-semibold leading-tight text-slate-900">
              Send feedback
            </h2>
            <p className="mt-0.5 text-xs leading-snug text-slate-600">
              A real person on the AppBlips team reads every message.
            </p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>
      </div>
      {state === 'sent' ? (
        <>
          <div className="flex flex-col items-center px-6 py-10 text-center text-sm leading-relaxed text-slate-700">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 ring-8 ring-emerald-500/10 animate-scale-in">
              <Heart size={28} fill="currentColor" aria-hidden="true" />
            </span>
            <p role="status" className="mt-5 text-base font-semibold text-slate-900">{result}</p>
            <p className="mt-1.5 max-w-xs">
              {email.trim() ? 'We read all feedback and may email you if we have questions.' : 'We read all feedback.'}
            </p>
          </div>
          <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-6 py-4 flex justify-end">
            <button type="button" onClick={onClose} autoFocus className={PRIMARY_BUTTON}>Done</button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
          <div className="p-6 space-y-5 overflow-y-auto text-sm text-slate-700">
            <fieldset className="space-y-2">
              <legend className={LABEL_CLASS}>What kind of feedback?</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FEEDBACK_TYPES.map((option) => {
                  const style = TYPE_STYLES[option];
                  const { Icon } = style;
                  const selected = type === option;
                  return (
                    <label
                      key={option}
                      className={`group flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-sm font-medium transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-400/60 ${
                        selected
                          ? style.selected
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <input
                        type="radio"
                        name="feedback-type"
                        value={option}
                        checked={selected}
                        onChange={() => setType(option)}
                        className="sr-only"
                      />
                      <Icon size={16} className={`transition-colors ${selected ? style.icon : style.idleIcon}`} aria-hidden="true" />
                      {option}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="space-y-1.5">
              <label htmlFor="feedback-message" className={LABEL_CLASS}>Your feedback</label>
              <textarea
                id="feedback-message"
                rows={5}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={MAX_FEEDBACK_LENGTH}
                placeholder="What’s on your mind?"
                autoFocus
                className={`${INPUT_CLASS} resize-y`}
              />
              <p className="text-right text-xs tabular-nums text-slate-400" aria-hidden="true">
                {message.length} / {MAX_FEEDBACK_LENGTH}
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="feedback-email" className={LABEL_CLASS}>
                Your email <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <input
                id="feedback-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="Only if you’d like a reply"
                className={INPUT_CLASS}
              />
            </div>
            {/* Honeypot: clipped out of view rather than display:none, which
                some bots skip; hidden from screen readers and the Tab order. */}
            <div aria-hidden="true" className="sr-only">
              <label htmlFor="feedback-botcheck">Leave this unticked</label>
              <input
                id="feedback-botcheck"
                type="checkbox"
                name="botcheck"
                tabIndex={-1}
                autoComplete="off"
                checked={botcheck}
                onChange={(event) => setBotcheck(event.target.checked)}
              />
            </div>
            {state === 'error' && result && (
              <p role="alert" className="flex items-start gap-1.5 text-xs text-red-600">
                <CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />{result}
              </p>
            )}
          </div>
          <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-6 py-4 space-y-3">
            <p id="feedback-privacy" className="text-xs leading-snug text-slate-600">
              Only what you type here is sent, and it is delivered through Web3Forms. By sending feedback you agree to our{' '}
              <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>Privacy Policy</a>
              {' '}and to{' '}
              <a href={WEB3FORMS_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>Web3Forms&rsquo; privacy policy</a>.
              Nothing about your projects is included.
            </p>
            <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>Cancel</button>
            <button type="submit" disabled={sending} className={PRIMARY_BUTTON}>
              {!sending && <Send size={15} aria-hidden="true" />}
              {sending ? 'Sending…' : 'Send feedback'}
            </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
