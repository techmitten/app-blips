import { useEffect, useState } from 'react';
import { isDesktop, desktopBridge } from '../lib/desktop';
import { checkForUpdate, STORE_URL } from '../lib/updates';
import { safeStorage } from '../lib/config';
import { logWarn } from '../lib/errorLog';

// Settings → Workspace → Check for updates → "Check now". Asks straight away
// (skipping the hourly cache and the desktop updater's hourly limit) and
// shows the answer under the row. Works even with the switch off: clicking
// is the user asking for this one check. Mirrors UpdateNotice's three kinds
// of install: self-updating desktop builds report downloading/ready, the
// Microsoft Store says the Store handles updates (without asking GitHub, whose
// releases go out before the Store approves them), everything else links to
// the release.
// A dismissed notice doesn't hide the answer here, since the user asked.
//
// `checking` is kept apart from `result` so a repeat check leaves the last
// answer on screen until the new one replaces it, and the checking state is
// held for at least MIN_CHECKING_MS: the Microsoft Store answer is instant, and
// without both the row blinked (answer gone, "Checking…" for one frame, answer
// back) and the modal jumped height on every click.
const MIN_CHECKING_MS = 600;

export function useUpdateCheck() {
  const [result, setResult] = useState(null); // { status, version?, url?, deb?, apt? }
  const [checking, setChecking] = useState(false);

  // A self-updating build finishes downloading after the check returns.
  useEffect(() => (isDesktop ? desktopBridge.updates.onStatus((state) => {
    if (state?.status === 'ready' || state?.status === 'downloading') setResult({ status: state.status, version: state.version });
  }) : undefined), []);

  const check = async () => {
    if (checking) return;
    setChecking(true);
    const started = Date.now();
    const answer = await askForUpdate();
    const wait = MIN_CHECKING_MS - (Date.now() - started);
    if (wait > 0) await new Promise((resolve) => { setTimeout(resolve, wait); });
    setResult(answer);
    setChecking(false);
  };

  return { result, checking, check };
}

async function askForUpdate() {
  try {
    if (isDesktop) {
      const desktop = await desktopBridge.updates.check({ force: true }).catch((err) => {
        logWarn('Desktop update check failed; checking GitHub releases instead', err);
        return null;
      });
      if (desktop?.store) return { status: 'store', url: STORE_URL };
      if (desktop?.auto) {
        const state = desktop.state || {};
        return state.status === 'downloading' || state.status === 'ready'
          ? { status: state.status, version: state.version }
          : { status: 'current' };
      }
      const release = await checkForUpdate({ storage: safeStorage('local'), force: true });
      return release
        ? { status: 'available', ...release, ...(desktop?.deb ? { deb: true, apt: Boolean(desktop.apt) } : {}) }
        : { status: 'current' };
    }
    const release = await checkForUpdate({ storage: safeStorage('local'), force: true });
    return release ? { status: 'available', ...release } : { status: 'current' };
  } catch (err) {
    logWarn('Manual update check failed', err);
    return { status: 'failed' };
  }
}
