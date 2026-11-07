import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

// Building blocks shared by the settings-style modals (SettingsModal), so
// their rows, switches and buttons stay identical.

export const FIELD_CLASS = 'w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400';
export const PRIMARY_BUTTON = 'brand-fill-text inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2 bg-brand text-white font-semibold text-sm hover:bg-brand-hover shadow-sm transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';
export const SECONDARY_BUTTON = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50';

// One setting: label + helper text on the left, control on the right. Stacks on
// narrow widths so segmented controls never squeeze the copy. `details` is
// optional full-width content below the row (e.g. fields revealed by a switch).
// headingLevel: rows sit under the dialog's h2 by default; a tab that groups
// rows under its own section headings (About) passes 4.
export function SettingRow({ id, title, description, children, details, headingLevel = 3 }) {
  const Heading = `h${headingLevel}`;
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-x-6 gap-y-2.5">
        <div className="min-w-0 sm:max-w-[60%]">
          <Heading id={id} className="text-sm font-semibold text-slate-900">{title}</Heading>
          {description && <p className="mt-0.5 text-xs text-slate-600 leading-snug">{description}</p>}
        </div>
        {children && <div className="shrink-0">{children}</div>}
      </div>
      {details && <div className="mt-3.5">{details}</div>}
    </div>
  );
}

export function Switch({ checked, onChange, labelledBy, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked
          ? 'bg-emerald-500 border-transparent'
          : 'bg-slate-200 border-slate-300 hover:bg-slate-300/70 dark:bg-slate-700 dark:border-slate-600 dark:hover:bg-slate-600/70'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-5.75 bg-white' : 'translate-x-0.75 bg-white dark:bg-slate-300'
        }`}
      />
    </button>
  );
}

// Tab panel beside a TabList. Fixed height on wider screens so the modal
// doesn't resize between tabs.
export const TAB_PANEL_CLASS = 'flex-1 min-w-0 px-6 py-5 overflow-y-auto custom-scrollbar sm:h-[26rem] focus-visible:outline-none';

// Vertical tab sidebar (a grid above the panel under 640px). WAI-ARIA tabs
// pattern: roving tabindex, arrows/Home/End move + activate. Each tab is
// { id, label, Icon, attention? }; `attention` marks a tab whose contents
// currently block the modal's main action, since they may be out of view.
// Ids are `${idPrefix}-tab-${id}` / `${idPrefix}-panel-${id}`.
export function TabList({ tabs, active, onSelect, idPrefix, label }) {
  const tabRefs = useRef({});

  const onKeyDown = (event) => {
    const index = tabs.findIndex((t) => t.id === active);
    const vertical = window.matchMedia('(min-width: 640px)').matches;
    const prevKey = vertical ? 'ArrowUp' : 'ArrowLeft';
    const nextKey = vertical ? 'ArrowDown' : 'ArrowRight';
    let next = null;
    if (event.key === nextKey) next = (index + 1) % tabs.length;
    else if (event.key === prevKey) next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    const id = tabs[next].id;
    onSelect(id);
    tabRefs.current[id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
      className={`shrink-0 grid ${tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'} sm:flex sm:flex-col gap-1 p-2 sm:p-3 sm:w-56 border-b sm:border-b-0 sm:border-r border-slate-200 bg-slate-50/60`}
    >
      {tabs.map(({ id, label: tabLabel, Icon, attention }) => {
        const selected = active === id;
        return (
          <button
            key={id}
            ref={(el) => { tabRefs.current[id] = el; }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(id)}
            className={`flex min-w-0 items-center justify-center sm:justify-start gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 ${
              selected
                ? 'bg-indigo-500/10 text-indigo-600 font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Icon size={16} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{tabLabel}</span>
            {attention && (
              <>
                <span aria-hidden="true" className="sm:ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span className="sr-only">(needs attention)</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Dropdown for a setting with more choices than fit as a segmented row.
// options: [{ value, label, hint?, badge? }]. A button shows the current
// choice; the list opens in a portal with fixed positioning, so the settings
// body's scroll box never clips it, and flips above the button when there
// isn't room below. Keyboard follows the listbox pattern: arrows, Home/End,
// Enter/Space to pick, Escape or Tab to close, typing a letter to jump.
export function SelectMenu({ label, value, options, onChange, labelledBy }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  const place = useCallback(() => {
    const button = buttonRef.current;
    const list = listRef.current;
    if (!button || !list) return;
    const rect = button.getBoundingClientRect();
    const height = list.offsetHeight;
    const width = Math.max(rect.width, 240);
    const gap = 6;
    const below = window.innerHeight - rect.bottom - gap;
    const top = below >= height || below >= rect.top - gap ? rect.bottom + gap : rect.top - gap - height;
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    setPosition({ top: Math.max(8, top), left, width });
  }, []);

  // Measured before paint, so the list never shows at a stale spot.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  const hide = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (buttonRef.current?.contains(event.target) || listRef.current?.contains(event.target)) return;
      hide();
    };
    // The list is fixed to where the button was; scrolling the settings body
    // or resizing the window would leave it floating, so follow the button.
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place, hide]);

  useEffect(() => {
    if (open && position) listRef.current?.focus();
  }, [open, position]);

  const openList = () => {
    setActive(selectedIndex);
    setOpen(true);
  };

  const close = (refocus = true) => {
    hide();
    if (refocus) buttonRef.current?.focus();
  };

  const pick = (index) => {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    close();
  };

  const onButtonKeyDown = (event) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openList();
    }
  };

  const onListKeyDown = (event) => {
    const last = options.length - 1;
    const move = (index) => {
      event.preventDefault();
      setActive(Math.min(last, Math.max(0, index)));
    };
    if (event.key === 'ArrowDown') move(active + 1);
    else if (event.key === 'ArrowUp') move(active - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(last);
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(active);
    } else if (event.key === 'Escape') {
      // Only the list closes, not a dialog it sits in.
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      close(false);
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const letter = event.key.toLowerCase();
      const from = (active + 1) % options.length;
      const order = [...options.slice(from), ...options.slice(0, from)];
      const hit = order.find((option) => option.label.toLowerCase().startsWith(letter));
      if (hit) move(options.indexOf(hit));
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onButtonKeyDown}
        className={`inline-flex min-w-[10rem] items-center justify-between gap-3 rounded-lg border bg-surface px-3 py-2 text-sm font-semibold text-slate-900 shadow-2xs transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
          open ? 'border-indigo-400 ring-2 ring-indigo-500/15' : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-slate-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKeyDown}
          style={position ? { top: position.top, left: position.left, width: position.width } : { visibility: 'hidden', top: 0, left: 0 }}
          className="select-menu fixed z-[80] max-h-[min(20rem,70vh)] overflow-y-auto rounded-xl border border-slate-200 bg-surface p-1 shadow-xl outline-none animate-scale-in dark:border-white/12 dark:bg-[#1c1c22] dark:shadow-[0_16px_40px_-12px_rgb(0_0_0/0.85)]"
        >
          {options.map((option, index) => {
            const isSelected = index === selectedIndex;
            const isActive = index === active;
            return (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                onPointerMove={() => setActive(index)}
                onClick={() => pick(index)}
                className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer select-none ${isActive ? 'bg-slate-100 dark:bg-white/[0.07]' : ''}`}
              >
                <span className="mt-0.5 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden="true">
                  {isSelected && <Check size={16} strokeWidth={2.5} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`text-sm ${isSelected ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'}`}>{option.label}</span>
                    {option.badge && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 bg-indigo-500/15">{option.badge}</span>
                    )}
                  </span>
                  {option.hint && <span className="mt-0.5 block text-xs leading-snug text-slate-500">{option.hint}</span>}
                </span>
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </>
  );
}
