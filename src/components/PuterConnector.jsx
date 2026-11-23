import { CircleCheck, Info } from 'lucide-react';
import { SettingRow, Switch } from './SettingControls';
import { CONNECTOR_DEFINITIONS } from '../lib/connectors';

// Settings → Extensions → Puter. There is no key and no account to connect:
// the switch is all the AI needs. Puter can't run in the sandboxed preview,
// so the page says to test Puter features on the published site.
export default function PuterConnector({ state, onChange }) {
  const { page } = CONNECTOR_DEFINITIONS.puter;
  return (
    <>
      <SettingRow id="set-puter" title="Enable Puter" description={page.enableDescription}>
        <Switch checked={state.enabled} onChange={(enabled) => onChange({ enabled })} labelledBy="set-puter" />
      </SettingRow>
      {state.enabled && (
        <p role="status" className="inline-flex items-start gap-1.5 pt-3 text-xs text-emerald-600">
          <CircleCheck size={14} className="mt-px shrink-0" aria-hidden="true" />{page.connected}
        </p>
      )}
      <p className="inline-flex items-start gap-1.5 py-3 text-xs leading-snug text-slate-600">
        <Info size={14} className="mt-px shrink-0" aria-hidden="true" />{page.previewNote}
      </p>
    </>
  );
}
