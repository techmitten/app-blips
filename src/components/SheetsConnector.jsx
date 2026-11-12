import { useEffect, useState } from 'react';
import { Check, CircleAlert, CircleCheck, Copy, ExternalLink, Loader2, PartyPopper, ShieldCheck, TriangleAlert } from 'lucide-react';
import { ConfirmedLink } from './ExternalLinkConfirm';
import { SettingRow, Switch, FIELD_CLASS, PRIMARY_BUTTON } from './SettingControls';
import { CONNECTOR_DEFINITIONS, connectorStatus } from '../lib/connectors';
import { SHEETS_SCRIPT, SHEETS_SCRIPT_VERSION, pingSheetsScript } from '../lib/sheetsHelper';

// Settings → Extensions → Google Sheets Backend (ConnectorsSettings.jsx). The
// plain connector page asks for the key first, but here the URL only exists
// once the steps are done, so the page runs in that order: the switch, the
// steps (with the Apps Script to copy), then the Web app URL box and a check
// that the deployed script answers. The full steps are in "How it works".
const TEST_RESULTS = {
  unreachable: 'Couldn’t reach your script. In Apps Script, check that “Who has access” is set to Anyone, and that you copied the Web app URL, not the script’s own address.',
  'not-script': 'Something answered, but not the AppBlips script. Paste the script from this page into Apps Script, save it, and deploy a new version.',
  outdated: 'Your script works, but there is a newer one. Copy the script again, paste it over the old one in Apps Script, then use Deploy, Manage deployments, edit, and choose New version.',
};

// Apps Script's small "Save project to Drive" toolbar icon (a floppy disk with
// a Drive badge), drawn here so the step can show what to look for.
function AppsScriptSaveIcon() {
  return (
    // A white chip like Apps Script's own toolbar (white in both themes, with
    // Google's grey icon), so it reads as "find this button", at a size where
    // the floppy disk and its Drive badge are recognizable.
    <span
      className="mx-1 inline-flex items-center justify-center rounded-md border border-slate-300 align-middle shadow-sm"
      style={{ background: '#fff', color: '#444746', width: 30, height: 26 }}
    >
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      role="img"
      aria-label="Save icon"
      className="block"
    >
      <defs>
        <mask id="apps-script-save-badge-cut">
          <rect width="24" height="24" fill="white" />
          <circle cx="18" cy="18" r="6.5" fill="black" />
        </mask>
      </defs>
      <g mask="url(#apps-script-save-badge-cut)">
        <path d="M5 3h11.2L20 6.8V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="currentColor" />
        <rect x="6" y="5" width="9" height="4.5" rx="0.6" fill="#fff" />
        <circle cx="11.5" cy="15" r="2.6" fill="#fff" />
      </g>
      <circle cx="18" cy="18" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M18 15.6 20.5 20h-5Z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
    </span>
  );
}

// The URL box: a stronger outline and a light fill so it stands out on the
// dark settings card, in the page's own font like the rest of the steps.
const URL_FIELD = `${FIELD_CLASS.replace('border-slate-300', 'border-slate-500 dark:border-white/70')} bg-slate-50 dark:bg-white/5 placeholder:text-slate-500 placeholder:italic`;

// Both buttons match Settings' Done button (PRIMARY_BUTTON). After copying,
// only the icon changes (a green check) for two seconds; Test connection fades
// only a little while disabled, so it still reads as a button.
const COPY_BUTTON = PRIMARY_BUTTON;
const TEST_BUTTON = PRIMARY_BUTTON.replace('disabled:opacity-50', 'disabled:opacity-60');

// A highlighted note inside a setup step: amber for a warning ("Attention"),
// green for reassurance ("Why unsafe?").
const CALLOUT_TONES = {
  warn: { box: 'border-amber-500/40 bg-amber-500/10 text-amber-700', Icon: TriangleAlert },
  ok: { box: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700', Icon: ShieldCheck },
};

function Callout({ title, tone = 'warn', children }) {
  const { box, Icon } = CALLOUT_TONES[tone];
  return (
    <span className={`block rounded-lg border p-2.5 ${box}`}>
      <span className="flex items-center gap-1.5 font-semibold"><Icon size={14} className="shrink-0" aria-hidden="true" />{title}</span>
      <span className="mt-1 block">{children}</span>
    </span>
  );
}

export default function SheetsConnector({ state, onChange }) {
  const def = CONNECTOR_DEFINITIONS.sheets;
  const { page } = def;
  const url = state.key.trim();
  const status = connectorStatus('sheets', { sheets: state });
  const urlBad = state.enabled && url !== '' && !def.isValidKey(url);

  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [testing, setTesting] = useState(false);
  // { url, outcome }: only shown while it is about the URL in the box.
  const [tested, setTested] = useState(null);
  const result = tested?.url === url ? tested.outcome : null;

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SHEETS_SCRIPT);
      setCopyFailed(false);
      setCopied(true);
    } catch {
      setCopyFailed(true);
    }
  };

  const test = async () => {
    setTesting(true);
    setTested(null);
    const answer = await pingSheetsScript(url);
    setTesting(false);
    const outcome = !answer.ok ? answer.reason : answer.version < SHEETS_SCRIPT_VERSION ? 'outdated' : 'ok';
    setTested({ url, outcome });
  };

  return (
    <>
      <SettingRow id="set-sheets" title={`Enable ${def.name}`} description={page.enableDescription}>
        <Switch checked={state.enabled} onChange={(enabled) => onChange({ enabled })} labelledBy="set-sheets" />
      </SettingRow>
      {state.enabled && (
        <div className="py-4 space-y-3">
          <h4 className="text-sm font-semibold text-slate-900">Set up your Sheet</h4>
          <ol className="list-decimal space-y-2 pl-5 text-xs leading-snug text-slate-600">
            <li>
              <ConfirmedLink href={def.keyUrl} why="To create a new Google Sheet in your Google account. Your sites will save to it." className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline">
                Click here<ExternalLink size={11} aria-hidden="true" />
              </ConfirmedLink>{' '}
              to open your browser with a new Google Sheet.
            </li>
            <li>Name your Sheet: click <strong>Untitled spreadsheet</strong> at the top left, type a name you will recognize, such as <strong>My site data</strong>, and press <strong>Enter</strong>. Everything your sites save will go here.</li>
            <li>In the Sheet, click the <strong>Extensions</strong> menu at the top of Google Sheets (next to Data and Tools), then choose <strong>Apps Script</strong>.</li>
            <li className="space-y-1.5">
              <span className="block">Apps Script opens in a new tab with a few lines of code already in it. Delete them, paste the script from here, then click the small <strong>Save</strong> icon <AppsScriptSaveIcon /> above the code (or press <strong>Ctrl+S</strong>, <strong>⌘+S</strong> on a Mac).</span>
              <div className="py-2">
                <button type="button" onClick={copy} className={COPY_BUTTON}>
                  {copied ? <Check size={14} strokeWidth={3} className="text-emerald-600" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  {/* Both labels share one grid cell, so the button keeps the
                      longer one's width when it switches to "Copied". */}
                  <span className="grid text-left">
                    <span aria-hidden="true" className="invisible col-start-1 row-start-1">Click to copy script</span>
                    <span className="col-start-1 row-start-1">{copied ? 'Copied' : 'Click to copy script'}</span>
                  </span>
                </button>
              </div>
              {copyFailed && (
                <span className="block space-y-1.5">
                  <span role="alert" className="block text-red-600">Couldn’t copy. Select the script below and copy it yourself.</span>
                  <textarea readOnly rows={6} value={SHEETS_SCRIPT} onFocus={(event) => event.target.select()} className="w-full rounded-lg border border-slate-300 bg-transparent p-2 font-mono text-[11px] text-slate-800" />
                </span>
              )}
            </li>
            <li className="space-y-2">
              <span className="block">Stay in Google Sheets/Apps Script, click the blue <strong>Deploy</strong> button (top right), then <strong>New deployment</strong>. Click the gear next to “Select type” and choose <strong>Web app</strong>. Set “Execute as” to <strong>Me</strong> and “Who has access” to <strong>Anyone</strong>, then click <strong>Deploy</strong>.</span>
              <Callout title="Attention">Setting the permission to “Anyone” allows those you share the link with to access the sheet.This is required for the backend to function properly. <strong> Do not share the link with anyone.</strong></Callout>
            </li>
            <li className="space-y-2">
              <span className="block">Google asks you to allow access: click <strong>Authorize access</strong> and choose your Google account. If Google says it hasn’t verified the app, click <strong>Advanced</strong>, then <strong>Go to … (unsafe)</strong>.</span>
              <Callout title="Why unsafe?" tone="ok">Opening scripts from people you don’t know is unsafe, so Google warns you about every script it hasn’t checked. You are opening your own script, not someone else’s.</Callout>
            </li>
            <li>Google then shows a <strong>Web app URL</strong>. Copy it, come back here (to AppBlips) and paste it below.</li>
          </ol>

          <div className="space-y-2 pt-2">
            <label htmlFor="set-sheets-key" className="block text-sm font-semibold text-slate-900">{def.keyLabel}</label>
            <input
              id="set-sheets-key"
              type="text"
              value={state.key}
              onChange={(event) => onChange({ key: event.target.value })}
              placeholder={def.keyPlaceholder}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={urlBad}
              aria-describedby="set-sheets-help"
              className={URL_FIELD}
            />
            <p
              role={urlBad ? 'alert' : 'status'}
              className={`inline-flex items-start gap-1.5 text-xs ${urlBad ? 'text-red-600' : status === 'connected' ? 'text-emerald-600' : 'text-slate-600'}`}
            >
              {urlBad && <><CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />{page.invalid}</>}
              {!urlBad && status === 'connected' && <><CircleCheck size={14} className="mt-px shrink-0" aria-hidden="true" />{page.connected}</>}
              {!urlBad && status === 'needs-key' && page.needsKey}
            </p>
            <p id="set-sheets-help" className="text-xs leading-snug text-slate-600">{page.keyHelp}</p>
            <div>
              <button type="button" onClick={test} disabled={status !== 'connected' || testing} className={TEST_BUTTON}>
                {testing && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                Test connection
              </button>
            </div>
            {result === 'ok' && (
              <div role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-700">
                <p className="flex items-center gap-1.5 text-sm font-semibold"><PartyPopper size={16} className="shrink-0" aria-hidden="true" />Congratulations, you’re all set!</p>
                <p className="mt-1 text-xs leading-snug">Your Google Sheet is connected and working. Ask the AI for an RSVP form, a sign-up list, a poll or a leaderboard, and what visitors send will be saved to your Sheet. (This test didn’t add anything to it.)</p>
              </div>
            )}
            {result && result !== 'ok' && (
              <p role="alert" className="inline-flex items-start gap-1.5 text-xs text-red-600">
                <CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />{TEST_RESULTS[result]}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
