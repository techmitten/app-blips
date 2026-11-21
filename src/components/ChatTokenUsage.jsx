import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { formatTokenCount, getLiveUsage, subscribeLiveUsage, usageTotal } from '../lib/tokenUsage';

const exact = (n) => Math.round(n).toLocaleString();
const share = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
const percent = (part, whole) => {
  const value = share(part, whole);
  return value > 0 && value < 1 ? '<1%' : `${Math.round(value)}%`;
};

// The parts of the total, in the order the bar draws them. `input` includes
// cache reads and writes (tokenUsage.js), so fresh input is what's left.
const breakdown = (usage) => [
  { key: 'input', label: 'Input', detail: 'Your code, AppBlips\' instructions and the chat', value: Math.max(0, usage.input - usage.cached - usage.cacheWrite), always: true },
  { key: 'cached', label: 'Cache reads', detail: 'Input the AI reused from its cache, usually at a discount', value: usage.cached },
  { key: 'cache-write', label: 'Cache writes', detail: 'Input saved to the AI\'s cache for reuse', value: usage.cacheWrite },
  { key: 'output', label: 'Output', detail: 'What the AI wrote, including any thinking', value: usage.output, always: true },
  {
    key: 'estimated',
    label: usage.running ? 'Still counting' : 'Unreported',
    detail: usage.running ? 'Estimated until the AI provider reports the exact count' : 'Estimated: the AI provider didn\'t report these',
    value: usage.estimated,
  },
].filter((part) => part.always || part.value > 0);

// The current chat's token total, in the Build pane's header. It counts up
// while the AI works, and opens a panel with the breakdown. Always labelled
// an estimate: it sums what providers report, which isn't the bill (the panel
// says to check the provider).
export default function ChatTokenUsage() {
  const usage = useSyncExternalStore(subscribeLiveUsage, getLiveUsage);
  const visible = Boolean(usage && (usage.total || usage.running));
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();
  const titleId = useId();
  const isOpen = open && visible;

  const close = (refocus = true) => {
    setOpen(false);
    setPosition(null);
    if (refocus) triggerRef.current?.focus();
  };

  // Centred on the counter and kept inside the window: below it in the pane
  // header, above it when there's no room below (on phones the counter sits
  // over the composer). The panel is portalled to <body>: the Build pane is
  // zoomed and clips overflow.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    const panel = panelRef.current;
    if (!rect || !panel) return;
    const { offsetWidth: width, offsetHeight: height } = panel;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
    const fitsBelow = rect.bottom + 8 + height <= window.innerHeight - 8;
    const top = fitsBelow || rect.top - 8 - height < 8 ? rect.bottom + 8 : rect.top - 8 - height;
    setPosition((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
  }, [isOpen, usage]); // usage: new numbers can change the panel's size

  // Focus moves in once the panel is placed (it is hidden until then, and a
  // hidden element can't take focus), so screen readers announce it.
  const placed = Boolean(position);
  useEffect(() => {
    if (isOpen && placed) panelRef.current?.focus();
  }, [isOpen, placed]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event) => {
      if (!panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) close(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };
    const dismiss = () => close(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', dismiss);
    // A click in the preview iframe never reaches this document; the window
    // losing focus to it is the only sign.
    window.addEventListener('blur', dismiss);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
    };
  }, [isOpen]);

  if (!visible) return null;

  const parts = breakdown(usage);
  const turn = usage.lastTurn?.calls ? usage.lastTurn : null;
  const unreported = usage.calls - usage.reported;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? close(false) : setOpen(true))}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? panelId : undefined}
        aria-label={`Estimated ${exact(usage.total)} tokens used in this chat. Show details`}
        className={`chat-token-usage group inline-flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-xs 2xl:text-sm font-medium tabular-nums text-slate-500 transition-colors cursor-pointer hover:bg-slate-900/5 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white ${isOpen ? 'bg-slate-900/5 text-slate-900 dark:bg-white/10 dark:text-white' : ''}`}
      >
        {usage.running && <span className="token-usage-live-dot" aria-hidden="true" />}
        <span className="truncate">Est. {formatTokenCount(usage.total)} tokens</span>
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="token-usage-panel"
          style={position ? { top: position.top, left: position.left } : { visibility: 'hidden', top: 0, left: 0 }}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next && !panelRef.current?.contains(next) && !triggerRef.current?.contains(next)) close(false);
          }}
        >
          <div className="token-usage-head">
            <h3 id={titleId} className="token-usage-title">Token usage</h3>
            <span className="token-usage-scope">
              {usage.running ? <><span className="token-usage-live-dot" aria-hidden="true" /> Counting</> : 'This chat'}
            </span>
          </div>

          <p className="token-usage-total">
            <span className="token-usage-total-value">{exact(usage.total)}</span>
            <span className="token-usage-total-label">estimated tokens</span>
          </p>

          <div className="token-usage-bar" aria-hidden="true">
            {parts.map((part) => (
              part.value > 0 && <span key={part.key} className={`token-usage-seg token-usage-${part.key}`} style={{ width: `${share(part.value, usage.total)}%` }} />
            ))}
          </div>

          <dl className="token-usage-rows">
            {parts.map((part) => (
              <div key={part.key} className="token-usage-row" title={part.detail}>
                <dt>
                  <span className={`token-usage-swatch token-usage-${part.key}`} aria-hidden="true" />
                  <span className="token-usage-label">{part.label}</span>
                  <span className="token-usage-detail">{part.detail}</span>
                </dt>
                <dd>
                  <span className="token-usage-value">{exact(part.value)}</span>
                  <span className="token-usage-percent">{percent(part.value, usage.total)}</span>
                </dd>
              </div>
            ))}
          </dl>

          <div className="token-usage-divider" />

          <dl className="token-usage-facts">
            {turn && (
              <div>
                <dt>{usage.running ? 'This message so far' : 'Your last message'}</dt>
                <dd>{exact(usageTotal(turn))}</dd>
              </div>
            )}
            <div>
              <dt>AI requests</dt>
              <dd>
                {exact(usage.calls)}
                {unreported > 0 && <span className="token-usage-muted"> ({exact(unreported)} unreported)</span>}
              </dd>
            </div>
          </dl>

          <p className="token-usage-note">
            Every request sends your code and AppBlips&rsquo; instructions along, so input is usually most of it.
            This is an estimate, not a bill. Check your AI provider&rsquo;s usage or billing page for what you actually pay.
          </p>
        </div>,
        document.body,
      )}
    </>
  );
}
