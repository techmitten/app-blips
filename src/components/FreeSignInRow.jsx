import { useEffect, useState } from 'react';
import {
  freeSignInState,
  onFreeSignInChange,
  openFreeAccountDashboard,
  openFreeSignIn,
  signOutOfFreeAi,
} from '../lib/freeSignIn';
import { logError } from '../lib/errorLog';
import { SECONDARY_BUTTON } from './SettingControls';

// Settings → AI with Free AI chosen, on a server that asks for a sign-in
// (src/lib/freeSignIn.js): who is signed in, with Sign in / Sign out.
// Renders nothing when no sign-in is needed.
export default function FreeSignInRow() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    // A sign-in that can't load still shows, with why (freeSignIn.js).
    const refresh = () => freeSignInState()
      .then((next) => { if (live) setState(next); })
      .catch((err) => { if (live) setState({ required: true, error: err.message }); });
    refresh();
    const unsubscribe = onFreeSignInChange(refresh);
    return () => { live = false; unsubscribe(); };
  }, []);

  if (!state?.required) return null;
  if (state.error) return <p role="alert" className="text-xs text-rose-600 dark:text-rose-400 leading-snug">{state.error}</p>;

  const run = (action) => async () => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      logError('Free AI sign-in action failed', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-white/10 dark:bg-white/[0.04] px-3 py-2">
      <p className="text-xs text-slate-600 leading-snug">
        {state.signedIn
          ? <>Signed in to Free AI{state.name ? <> as <strong className="font-semibold text-slate-700">{state.name}</strong></> : null}.</>
          : 'Free AI requires signing in with Google or GitHub.'}
      </p>
      <div className="flex items-center gap-2">
        {state.signedIn && (
          <button type="button" onClick={run(openFreeAccountDashboard)} disabled={busy} className={SECONDARY_BUTTON}>
            Account
          </button>
        )}
        <button type="button" onClick={run(state.signedIn ? signOutOfFreeAi : openFreeSignIn)} disabled={busy} className={SECONDARY_BUTTON}>
          {state.signedIn ? 'Sign out' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}
