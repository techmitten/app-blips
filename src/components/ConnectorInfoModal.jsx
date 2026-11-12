import { useEffect } from 'react';
import {
  BookOpen, CircleCheck, CircleX, Info, Lightbulb, ListOrdered, Scale, Server, Sheet,
} from 'lucide-react';
import Modal, { ModalCloseButton } from './Modal';
import { PRIMARY_BUTTON } from './SettingControls';
import { CONNECTOR_DEFINITIONS } from '../lib/connectors';

// Icons for the optional `about.sections` (connectors.js names them by key,
// since that file has no React); BookOpen when a section names none.
const SECTION_ICONS = { server: Server, can: CircleCheck, cannot: CircleX, sheet: Sheet, tradeoffs: Scale };

// A section title that stands out while skimming: a tinted icon badge, the
// title, and a thin rule running to the edge.
function SectionTitle({ Icon, children }) {
  return (
    <h3 className="mb-2 flex items-center gap-2.5 text-sm font-semibold text-slate-900">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-600">
        <Icon size={15} aria-hidden="true" />
      </span>
      {children}
      <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
    </h3>
  );
}

// A section bullet like "Is slower: each save…" with its lead-in (up to the
// first colon) in bold, in the title colour (white on dark), so the list can
// be skimmed by its lead-ins.
function BulletText({ text }) {
  const colon = text.indexOf(': ');
  if (colon < 1 || colon > 60) return text;
  return <><strong className="font-semibold text-slate-900">{text.slice(0, colon + 1)}</strong>{text.slice(colon + 1)}</>;
}

// "How it works" for one connector, opened from its settings page. The text
// lives in the connector's `about` (lib/connectors.js) so every connector gets
// the same dialog. Sits above the Settings modal (z 60), like its confirms.
export default function ConnectorInfoModal({ id, onClose }) {
  const { name, about } = CONNECTOR_DEFINITIONS[id];

  // Escape closes only this dialog, not the Settings modal underneath.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <Modal
      zIndex={70}
      cardClass="w-full max-w-md xl:max-w-lg bg-surface rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-scale-in flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]"
      cardProps={{ role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'connector-info-title' }}
    >
      <div className="shrink-0 px-6 py-5 border-b border-slate-100 flex items-center justify-between">
        <h2 id="connector-info-title" className="text-base 2xl:text-lg font-semibold text-slate-900">
          How {name} works
        </h2>
        <ModalCloseButton onClick={onClose} />
      </div>
      <div className="p-6 space-y-5 overflow-y-auto text-sm leading-relaxed text-slate-700">
        <section>
          <SectionTitle Icon={Info}>What it does</SectionTitle>
          <p>{about.what}</p>
        </section>
        {/* Optional background sections (`about.sections`: { title, text?,
            lead?, items?, icon? }), between what it does and the steps;
            `lead` is a line of its own just above the list. */}
        {about.sections?.map(({ title, icon, text, lead, items }) => (
          <section key={title}>
            <SectionTitle Icon={SECTION_ICONS[icon] || BookOpen}>{title}</SectionTitle>
            {text && <p>{text}</p>}
            {lead && <p className={text ? 'mt-2' : ''}>{lead}</p>}
            {items?.length > 0 && (
              <ul className={`list-disc space-y-1.5 pl-5${text || lead ? ' mt-1.5' : ''}`}>
                {items.map((item) => <li key={item}><BulletText text={item} /></li>)}
              </ul>
            )}
          </section>
        ))}
        {/* Left out when the connector's own page already lists the steps. */}
        {about.steps?.length > 0 && (
          <section>
            <SectionTitle Icon={ListOrdered}>How it works</SectionTitle>
            <ol className="list-decimal space-y-1.5 pl-5">
              {about.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </section>
        )}
        {about.notes?.length > 0 && (
          <section>
            <SectionTitle Icon={Lightbulb}>Good to know</SectionTitle>
            <ul className="list-disc space-y-1.5 pl-5">
              {about.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </section>
        )}
      </div>
      <div className="shrink-0 bg-slate-50 px-6 py-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className={PRIMARY_BUTTON}
        >
          Got it
        </button>
      </div>
    </Modal>
  );
}
