import { ConfirmedLink } from './ExternalLinkConfirm';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { SECONDARY_BUTTON } from './SettingControls';
import DebUpdateHelp from './DebUpdateHelp';
import { isDesktop, desktopBridge } from '../lib/desktop';
import { UPDATE_GUIDE_URL } from '../lib/updates';
import { logError } from '../lib/errorLog';

// The "Check now" button and its answer for Settings → Workspace → Check for
// updates. The check itself lives in hooks/useUpdateCheck.js.
export function UpdateCheckButton({ checking, onCheck }) {
  return (
    <button type="button" onClick={onCheck} disabled={checking} className={SECONDARY_BUTTON}>
      <RefreshCw size={14} aria-hidden="true" className={checking ? 'animate-spin' : ''} />
      {/* Both labels share one grid cell so the button keeps its width. */}
      <span className="grid">
        <span className={`col-start-1 row-start-1 ${checking ? 'invisible' : ''}`}>Check now</span>
        <span className={`col-start-1 row-start-1 ${checking ? '' : 'invisible'}`} aria-hidden={!checking}>Checking…</span>
      </span>
    </button>
  );
}

export function UpdateCheckResult({ result }) {
  const [installing, setInstalling] = useState(false);
  const [installFailed, setInstallFailed] = useState(false);
  if (!result) return null;

  const install = () => {
    setInstalling(true);
    setInstallFailed(false);
    desktopBridge.updates.install().catch((err) => {
      logError('Could not install the downloaded update', err);
      setInstalling(false);
      setInstallFailed(true);
    });
  };

  const openStore = () => {
    try { window.open(result.url, '_blank', 'noopener,noreferrer'); } catch { /* blocked */ }
  };

  const text = {
    current: "You're up to date.",
    failed: "Couldn't reach GitHub to check. Check your internet connection and try again.",
    downloading: `AppBlips ${result.version} is downloading in the background. You'll be offered a restart when it's ready.`,
    ready: `AppBlips ${result.version} has downloaded. Restart to use it now, or it installs the next time you close AppBlips.`,
    available: `AppBlips ${result.version} is available.`,
    store: 'The Microsoft Store updates AppBlips for you. To check for a new version now, open AppBlips in the Store.',
  }[result.status];

  return (
    <div role="status" aria-live="polite" className="text-xs leading-snug">
      <p className={result.status === 'failed' ? 'text-red-600' : 'text-slate-600'}>{text}</p>
      {installFailed && (
        <p className="mt-1.5 text-red-600">
          The update couldn't start. Close AppBlips to install it, or download the new installer from the releases page.
        </p>
      )}
      {result.status === 'ready' && (
        <div className="mt-2">
          <button type="button" onClick={install} disabled={installing} className={SECONDARY_BUTTON}>
            {installing ? 'Restarting…' : 'Restart to update'}
          </button>
        </div>
      )}
      {result.status === 'available' && isDesktop && result.deb && (
        <div className="mt-1.5">
          <DebUpdateHelp update={result} Link={ConfirmedLink} />
        </div>
      )}
      {result.status === 'store' && (
        <div className="mt-2">
          {/* Opens the Store app, not a website, so it skips the "leaves
              AppBlips for this website" confirm: the label says where it goes. */}
          <button type="button" onClick={openStore} className={SECONDARY_BUTTON}>
            Open Microsoft Store
          </button>
        </div>
      )}
      {result.status === 'available' && !(isDesktop && result.deb) && (
        <div className="mt-2 flex flex-wrap gap-2">
          <ConfirmedLink href={isDesktop && result.downloadUrl ? result.downloadUrl : result.url} why={isDesktop ? 'To download the newer version of AppBlips from the AppBlips release page.' : 'To read what changed in the newest version of AppBlips.'} className={SECONDARY_BUTTON}>
            {isDesktop ? 'Download' : "What's new"}
          </ConfirmedLink>
          {!isDesktop && (
            <ConfirmedLink href={UPDATE_GUIDE_URL} why="To read step-by-step instructions for updating the browser version." className={SECONDARY_BUTTON}>
              How to update
            </ConfirmedLink>
          )}
        </div>
      )}
    </div>
  );
}
