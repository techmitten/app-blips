import { CircleCheck, Globe, Info } from 'lucide-react';
import { SettingRow, Switch } from './SettingControls';
import { CONNECTOR_DEFINITIONS, PROVIDER_SEARCH_CONNECTORS, connectorStatus } from '../lib/connectors';

const PROVIDER_NAMES = { deepseek: 'DeepSeek', anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini', xai: 'xAI', openrouter: 'OpenRouter' };

// The page of a provider web search tool (connectors.js
// PROVIDER_SEARCH_CONNECTORS). Only the tool for the provider the AI runs on
// (`inUse`, lib/providerWeb.js; '' when it has no web search) can be on: it
// is on unless the user switched it off. The others show Off with a disabled
// switch. Being on only adds the globe to the chat box; the globe turns
// search on.
export default function ProviderSearchConnector({ id, state, onChange, inUse, connectors }) {
  const def = CONNECTOR_DEFINITIONS[id];
  const providerName = PROVIDER_NAMES[def.providerSearch];
  const active = inUse === def.providerSearch;
  const on = active && state.enabled;
  const tavily = connectorStatus('tavily', connectors) === 'connected';
  const inUseProvider = PROVIDER_SEARCH_CONNECTORS.find((other) => other.providerSearch === inUse);
  let note;
  if (!active) {
    note = `Off: you’re not using ${providerName}. This tool switches on by itself when ${providerName} is your AI provider in Settings → AI.${inUseProvider ? ` You’re using ${PROVIDER_NAMES[inUse]}, so ${inUseProvider.name} is the one in use.` : ''}`;
  } else if (!state.enabled) {
    note = `Off: you switched it off, so the chat box has no web search globe. Switch it on to add the globe back.`;
  } else if (tavily) {
    note = `In use, but the Tavily extension is connected, so the AI searches with Tavily instead when you turn on the globe.`;
  } else {
    note = `In use: you’re using ${providerName}, so the web search globe is in the chat box.`;
  }
  return (
    <>
      <SettingRow id={`set-${id}`} title={`Enable ${def.name}`} description={def.page.enableDescription}>
        <Switch checked={on} disabled={!active} onChange={(enabled) => onChange({ enabled })} labelledBy={`set-${id}`} />
      </SettingRow>
      <div className="py-4 space-y-3">
        <p role="status" className={`flex items-start gap-1.5 text-xs leading-snug ${on && !tavily ? 'text-emerald-600' : 'text-slate-600'}`}>
          {on && !tavily
            ? <CircleCheck size={14} className="mt-px shrink-0" aria-hidden="true" />
            : <Info size={14} className="mt-px shrink-0" aria-hidden="true" />}
          {note}
        </p>
        <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <Globe size={16} className="mt-0.5 shrink-0 text-slate-600" aria-hidden="true" />
          <p className="text-xs leading-snug text-slate-700">
            <strong className="font-semibold text-slate-900">This adds the globe, it doesn’t turn search on.</strong>{' '}
            The AI only searches the web after you click the globe under the chat box. It turns red while search is on, and you can click it again at any time to turn search off.
          </p>
        </div>
      </div>
    </>
  );
}
