import { useEffect } from 'react';
import { useAuth, useClerk } from '@clerk/react';
import { setAccountSignOut, setAuthTokenGetter } from '../lib/authToken';
import { fetchBillingMe } from '../lib/billing';
import { setPlanWebSearch } from '../lib/planWeb';
import { AccountDialogsProvider } from './AccountDialogs';
import { useBrowserSignInTickets } from '../lib/browserSignIn';

// Shares the Clerk session with non-React code (the chat transport and
// billing helpers). Nothing here forces a sign-in: signing in is how a
// person chooses a plan (onboarding's "Subscribe to a plan", or Settings →
// Plan), and signed-out people build with their own AI key. So a session is
// only handed out while someone is signed in; the server treats a request
// with one as a plan user and one without as an own-key user.
export default function AuthSession({ children }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  // Desktop: finish Google/GitHub sign-ins that came back from the browser.
  useBrowserSignInTickets();

  // Installed while rendering, not in an effect: children's effects run
  // before this component's, and onboarding's plan step asks for the plan in
  // its first effect after a sign-in. Done from an effect, that request went
  // without the token, was refused, and a paying person was offered
  // Subscribe. Setting it again with the same values is harmless.
  setAuthTokenGetter(isSignedIn ? getToken : null);
  useEffect(() => () => setAuthTokenGetter(null), []);

  // For Factory Reset (App.jsx handleResetApp), which runs outside React's
  // Clerk hooks. Signs out without Clerk navigating: the reset reloads.
  useEffect(() => {
    setAccountSignOut(() => signOut());
    return () => setAccountSignOut(null);
  }, [signOut]);

  // The prompt box's plan web search button: offered once the plan is known
  // to be active (fetchBillingMe passes every answer on, so a checkout or a
  // later plan check updates it too), and never while signed out.
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) fetchBillingMe();
    else setPlanWebSearch(null);
  }, [isLoaded, isSignedIn]);

  return <AccountDialogsProvider>{children}</AccountDialogsProvider>;
}
