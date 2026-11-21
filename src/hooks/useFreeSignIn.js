import { useCallback, useEffect, useState } from 'react';
import {
  deleteFreeAccount,
  freeSignInState,
  onFreeSignInChange,
  openFreeAccountDashboard,
  openFreeSignIn,
  signOutOfFreeAi,
} from '../lib/freeSignIn';
import { isDesktop } from '../lib/desktop';
import { logError } from '../lib/errorLog';

/**
 * Tracks browser Free AI (Clerk) authentication state and exposes sign-in,
 * sign-out, Account Dashboard, and account-deletion actions.
 * Returns `{ state: null }` in the desktop app or before configuration loads.
 */
export function useFreeSignIn() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isDesktop) return undefined;
    let live = true;
    const refresh = () => freeSignInState({ eager: false })
      .then((next) => { if (live) setState(next); })
      .catch((err) => { if (live) setState({ required: true, signedIn: false, name: '', displayName: '', email: '', imageUrl: '', error: err.message }); });
    refresh();
    const unsubscribe = onFreeSignInChange(refresh);
    return () => { live = false; unsubscribe(); };
  }, []);

  const runAction = useCallback(async (label, action) => {
    setBusy(true);
    try {
      return await action();
    } catch (err) {
      logError(label, err);
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const signIn = useCallback(() => runAction('Free AI sign-in failed', openFreeSignIn), [runAction]);
  const signOut = useCallback(() => runAction('Free AI sign-out failed', signOutOfFreeAi), [runAction]);
  const openDashboard = useCallback(() => runAction('Could not open account dashboard', openFreeAccountDashboard), [runAction]);
  const deleteAccount = useCallback(() => runAction('Could not delete account', deleteFreeAccount), [runAction]);

  return { state, busy, signIn, signOut, openDashboard, deleteAccount };
}
