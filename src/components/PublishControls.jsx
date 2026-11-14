import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { SECONDARY_BUTTON } from './SettingControls';

// Small pieces shared by the Publish window (PublishDialog) and its custom
// domain checklist (CustomDomainStatus).

export const LINK_CLASS = 'font-semibold text-indigo-600 hover:underline';

// Copies a value and says so for a moment. `compact` is the icon-only form
// used beside DNS values.
export function CopyButton({ value, label, compact = false }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked: the value is still on screen */ }
  };
  if (compact) {
    return (
      <button type="button" onClick={copy} aria-label={copied ? 'Copied' : `Copy ${label}`} title={copied ? 'Copied' : 'Copy'} className="shrink-0 rounded-md p-1 text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-800">
        {copied ? <Check size={13} className="text-emerald-600" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      </button>
    );
  }
  return (
    <button type="button" onClick={copy} aria-label={copied ? 'Copied' : `Copy ${label}`} className={`${SECONDARY_BUTTON} shrink-0 py-1 text-xs`}>
      {copied ? <Check size={13} className="text-emerald-600" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// Marks custom domains as a beta feature. Same pill as Settings →
// Connectors' (BetaBadge in ConnectorsSettings.jsx).
export function BetaBadge() {
  return <span className="ml-1.5 align-middle rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 bg-indigo-500/15">Beta</span>;
}

// A custom domain's state at a glance: red and pulsing until it's live, then
// solid green. `size` is the dot's Tailwind size class.
export function StatusDot({ ok, size = 'h-2 w-2', className = '' }) {
  return (
    <span className={`relative inline-flex shrink-0 ${size} ${className}`} aria-hidden="true">
      {!ok && <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 motion-safe:animate-ping" />}
      <span className={`relative inline-flex ${size} rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
    </span>
  );
}
