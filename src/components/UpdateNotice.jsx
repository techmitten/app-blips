import { useEffect, useState } from 'react';
import { ArrowUpCircle, X } from 'lucide-react';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './SettingControls';
import DebUpdateHelp from './DebUpdateHelp';
import { isDesktop, desktopBridge } from '../lib/desktop';
import { checkForUpdate, CHECK_INTERVAL_MS, UPDATE_GUIDE_URL, STORE_URL } from '../lib/updates';
import { loadCheckUpdates, loadDismissedUpdate, saveDismissedUpdate, safeStorage } from '../lib/config';
import { logError, logWarn } from '../lib/errorLog';

// "A new version is out" notice, behind Settings → Workspace → Check for updates.
//   - Desktop Windows/AppImage builds update themselves (electron/updater.js):
//     the notice appears once the update has downloaded and offers a restart.
//   - Microsoft Store installs hear about GitHub releases but open the Store;
//     the notice explains that Store approval can take longer.
//   - Snap installs check the Snap Store and link to App Center.
//   - Every other install (.deb, running from source) gets a notice
//     from the GitHub release check (lib/updates.js) with a link: the .deb to
//     download the new installer, source to the update instructions. A .deb
//     also gets the steps to install it (DebUpdateHelp).
// Closing a release notice hides that version for good; "Later" on a
// downloaded desktop update only hides it until next launch (it installs
// when the app quits anyway).
// `aboveOverlay` lifts it over the full-screen onboarding (z-index 1000), so a
// fresh install hears about an update before setup is finished.
// Its links go through the external-link confirmation like any other.
function NoticeLink({ href, className, children }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>;
}

export default function UpdateNotice({ aboveOverlay = false }) {
  const [update, setUpdate] = useState(null); // { kind: 'notify' | 'ready', version, url?, deb? }
  const [installing, setInstalling] = useState(false);
  const [installFailed, setInstallFailed] = useState(false);

  useEffect(() => {
    if (!loadCheckUpdates()) return undefined;
    let cancelled = false;
    const fromDesktop = (state) => {
      if (!cancelled && state?.status === 'ready') setUpdate({ kind: 'ready', version: state.version });
    };
    // `desktop` is the desktop updater's answer (a .deb, or nothing).
    const checkReleases = (desktop = null) => checkForUpdate({ storage: safeStorage('local'), ...(desktop?.version ? { current: desktop.version } : {}) }).then((release) => {
      if (cancelled || !release || release.version === loadDismissedUpdate()) return;
      setUpdate({ kind: 'notify', ...release, ...(desktop?.deb ? { deb: true } : {}),
        ...(desktop?.store === 'microsoft' ? { store: 'microsoft', url: STORE_URL, downloadUrl: undefined } : {}) });
    });
    const run = async () => {
      if (isDesktop) {
        const result = await desktopBridge.updates.check().catch((err) => {
          logWarn('Desktop update check failed; checking GitHub releases instead', err);
          return null;
        });
        if (result?.store) {
          if (result.store === 'microsoft') {
            checkReleases(result);
            return;
          }
          if (!cancelled && result.update && result.update.version !== loadDismissedUpdate()) {
            setUpdate({ kind: 'notify', ...result.update });
          }
          return;
        }
        if (result?.auto) {
          fromDesktop(result.state);
          return;
        }
        checkReleases(result);
        return;
      }
      checkReleases();
    };
    const unsubscribe = isDesktop ? desktopBridge.updates.onStatus(fromDesktop) : () => {};
    run();
    const timer = setInterval(run, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      unsubscribe();
    };
  }, []);

  if (!update) return null;

  const dismiss = () => {
    if (update.kind === 'notify') saveDismissedUpdate(update.version);
    setUpdate(null);
  };

  const install = () => {
    setInstalling(true);
    setInstallFailed(false);
    desktopBridge.updates.install().catch((err) => {
      logError('Could not install the downloaded update', err);
      setInstalling(false);
      setInstallFailed(true);
    });
  };

  const ready = update.kind === 'ready';
  const deb = !ready && isDesktop && update.deb;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`update-notice dark force-dark palette-stock fixed bottom-4 right-4 ${aboveOverlay ? 'z-1200' : 'z-85'} w-[calc(100%-2rem)] max-w-sm rounded-xl border border-slate-200 bg-surface px-4 py-3.5 shadow-xl text-sm text-slate-700`}
    >
      <div className="flex items-start gap-3">
        <ArrowUpCircle size={18} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900">
            {ready ? 'Update ready' : `AppBlips ${update.version} is available`}
          </p>
          {deb ? (
            <div className="mt-0.5">
              <DebUpdateHelp update={update} Link={NoticeLink} />
            </div>
          ) : (
          <p className="mt-0.5 text-xs text-slate-600 leading-snug">
            {ready
              ? `AppBlips ${update.version} has downloaded. Restart to use it now, or it installs the next time you close AppBlips.`
              : update.store === 'microsoft'
                  ? 'Open the Microsoft Store to check for the update. It may take a little longer to appear while Microsoft approves it.'
                  : update.snap
                  ? 'Close AppBlips, then update it in App Center. Ubuntu also checks for updates automatically.'
                  : isDesktop
                  ? 'Download the new installer and install it over this version. Your projects stay where they are.'
                  : 'See what changed, and how to update your copy.'}
          </p>
          )}
          {installFailed && (
            <p className="mt-1.5 text-xs text-red-600 leading-snug">
              The update couldn't start. Close AppBlips to install it, or download the new installer from the releases page.
            </p>
          )}
          {!deb && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {ready ? (
              <>
                <button type="button" onClick={install} disabled={installing} className={PRIMARY_BUTTON}>
                  {installing ? 'Restarting…' : 'Restart to update'}
                </button>
                <button type="button" onClick={dismiss} disabled={installing} className={SECONDARY_BUTTON}>Later</button>
              </>
            ) : (
              <>
                <a href={isDesktop && update.downloadUrl ? update.downloadUrl : update.url} target="_blank" rel="noopener noreferrer" className={SECONDARY_BUTTON}>
                  {update.store === 'microsoft' ? 'Open Microsoft Store' : update.snap ? 'Open App Center' : isDesktop ? 'Download' : "What's new"}
                </a>
                {!isDesktop && (
                  <a href={UPDATE_GUIDE_URL} target="_blank" rel="noopener noreferrer" className={SECONDARY_BUTTON}>
                    How to update
                  </a>
                )}
              </>
            )}
          </div>
          )}
        </div>
        {!ready && (
          <button
            type="button"
            onClick={dismiss}
            className="text-slate-400 hover:text-slate-700 p-1 -m-1 rounded-lg transition-colors"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
