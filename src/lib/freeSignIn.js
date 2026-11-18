// Sign-in for Free AI in the browser version, when the server asks for it
// (electron/server/freeAuth.js: GET /api/provider reports `freeSignIn` with
// the Clerk publishable key). Only Free AI requests need it: with the user's
// own API key, or in the desktop app, nothing here runs and Clerk is never
// loaded. Clerk and its sign-in screens (@clerk/clerk-js and @clerk/ui, in
// their own chunks) load the first time a Free AI request is about to be sent.
//
// Sign-in is Google or GitHub only (set in the Clerk dashboard). OAuth opens
// in a popup, so the page, and the prompt being typed, stay as they are.
import { isDesktop, webProviderStore } from './desktop.js';
import { logError, logWarn } from './errorLog.js';

let configPromise = null;
let clerkPromise = null;
let syncPromise = null;
const listeners = new Set();

// Clerk gets one try per page load: a second Clerk instance on a page where
// the first failed can hang, and a blocked or unreachable Clerk domain would
// otherwise stall every Free AI request. Reloading the page tries again.
const LOAD_TIMEOUT_MS = 20_000;
export const SIGN_IN_UNAVAILABLE = 'The Free AI sign-in couldn’t load. Check your internet connection (or anything that blocks sign-in pages), then reload the page. You can also use your own API key in Settings → AI.';

const CLERK_FLOW_PATTERN = /(?:__clerk_|\/(?:sso-callback|factor-|reset-password|verify|continue|tasks|create)(?:[/?#]|$))/i;

// OAuth in a popup, so the page stays as it is; and Google shows its account
// picker instead of quietly using whichever account the browser is signed in to.
// Keep fallback redirects on the current page instead of Clerk's dashboard home URL.
const signInOptions = () => {
  const currentUrl = typeof window !== 'undefined' && window.location?.href ? window.location.href : undefined;
  return {
    oauthFlow: 'popup',
    oidcPrompt: 'select_account',
    ...(currentUrl ? {
      fallbackRedirectUrl: currentUrl,
      signInFallbackRedirectUrl: currentUrl,
      signUpFallbackRedirectUrl: currentUrl,
    } : {}),
  };
};

// Clerk's modal sits near the top by default, and its 100vw backdrop counts
// the scrollbar, so it can sit off centre. Centre it like the app's dialogs.
const APPEARANCE = {
  elements: {
    modalBackdrop: { width: '100%', alignItems: 'center' },
    modalContent: { margin: 'auto' },
  },
};

// A press outside the sign-in modal would close it (Clerk has no setting for
// this). Clerk closes it only for a press on its backdrop element itself, so
// swallow those at the window, before Clerk's listener on the document sees
// them. The modal's close button and Escape still close it.
const keepSignInOpen = () => {
  const swallow = (event) => {
    if (event.target instanceof Element && event.target.classList.contains('cl-modalBackdrop')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  for (const type of ['pointerdown', 'mousedown', 'touchstart', 'click']) {
    window.addEventListener(type, swallow, { capture: true, passive: false });
  }
};

const notify = () => {
  for (const listener of listeners) listener();
};

const pickActiveSession = (clerk) => {
  const sessions = clerk?.client?.signedInSessions;
  if (!Array.isArray(sessions) || !sessions.length) return null;
  const lastId = clerk.client?.lastActiveSessionId;
  return (
    sessions.find((s) => s.status === 'active' && s.id === lastId)
    || sessions.find((s) => s.status === 'active')
    || null
  );
};

/**
 * Decides whether a same-origin Clerk navigation target should be followed
 * (e.g. an OAuth/SSO callback or session task) rather than ignored to preserve
 * the unsent prompt in the app.
 */
export const shouldFollowClerkRoute = (to, clerk, currentHref = typeof window !== 'undefined' ? window.location.href : 'http://localhost/') => {
  if (!to || typeof to !== 'string') return false;
  let target;
  let current;
  try {
    current = new URL(currentHref);
    target = new URL(to, current.origin);
  } catch {
    return false;
  }
  if (target.origin !== current.origin) return true;
  if (clerk?.isSignedIn && !/\/tasks(?:[/?#]|$)/i.test(`${target.pathname}${target.hash}`)) return false;
  return CLERK_FLOW_PATTERN.test(`${target.pathname}${target.search}${target.hash}`);
};

/**
 * Synchronizes Clerk's in-memory session with `clerk.client` so sessions
 * created in a popup, Account Portal, or another tab are picked up before
 * opening the sign-in modal.
 */
export const syncClerkSession = async (clerk, { forceReload = false } = {}) => {
  if (!clerk) return false;
  if (!forceReload && clerk.isSignedIn && clerk.session) return true;
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    try {
      if (forceReload || !clerk.isSignedIn || !clerk.session) {
        try {
          await clerk.client?.reload?.();
        } catch (err) {
          logWarn('Could not refresh the Free AI sign-in state', err);
        }
      }
      const active = pickActiveSession(clerk);
      if (active && clerk.session?.id !== active.id && typeof clerk.setActive === 'function') {
        try {
          await clerk.setActive({ session: active });
        } catch (err) {
          logWarn('Could not activate the existing Free AI session', err);
        }
      }
      if (clerk.isSignedIn || clerk.session?.status === 'active') {
        clerk.closeSignIn?.();
        notify();
        return true;
      }
      return false;
    } finally {
      syncPromise = null;
    }
  })();
  return syncPromise;
};

const syncWhenVisible = (clerk) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const check = () => {
    if (document.visibilityState === 'visible' && !clerk.isSignedIn) {
      syncClerkSession(clerk).catch(() => {});
    }
  };
  document.addEventListener?.('visibilitychange', check);
  window.addEventListener?.('focus', check);
};

// Calls `listener` when the signed-in user changes. Returns an unsubscribe.
export const onFreeSignInChange = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// The server's sign-in settings ({ publishableKey }), or null when Free AI
// needs no sign-in here. Asked once per page load.
export const freeSignInConfig = () => {
  if (isDesktop) return Promise.resolve(null);
  configPromise ??= webProviderStore.get()
    .then((info) => (info?.freeSignIn?.publishableKey ? info.freeSignIn : null))
    .catch((err) => {
      configPromise = null;
      logError('Could not check whether Free AI needs a sign-in', err);
      return null;
    });
  return configPromise;
};

// Whether the next AI request goes to the Free option (no provider of the
// user's own is switched on in Settings → AI).
export const usesFreeAi = () => !isDesktop && !webProviderStore.forRequest();

const defaultImportClerk = () => Promise.all([import('@clerk/clerk-js'), import('@clerk/ui')]);

// The loaded Clerk instance, or null when no sign-in is needed. Rejects with
// SIGN_IN_UNAVAILABLE (the cause logged) if Clerk can't load.
export const loadFreeSignIn = async ({ importClerk = defaultImportClerk } = {}) => {
  const config = await freeSignInConfig();
  if (!config) return null;
  clerkPromise ??= (async () => {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Clerk didn’t load within ${LOAD_TIMEOUT_MS / 1000} s`)), LOAD_TIMEOUT_MS);
    });
    try {
      const clerk = await Promise.race([timeout, (async () => {
        // Clerk's sign-in screens are a separate package (@clerk/ui), bundled
        // here rather than fetched from Clerk at run time.
        const [{ Clerk }, { ui }] = await importClerk();
        const instance = new Clerk(config.publishableKey);
        const currentUrl = typeof window !== 'undefined' && window.location?.href ? window.location.href : undefined;
        const navigate = (to, { windowNavigate } = {}) => {
          if (shouldFollowClerkRoute(to, instance)) {
            windowNavigate?.(to);
            return;
          }
          if (instance.isSignedIn || instance.session) instance.closeSignIn?.();
        };
        await instance.load({
          ui,
          ...(currentUrl ? {
            fallbackRedirectUrl: currentUrl,
            signInFallbackRedirectUrl: currentUrl,
            signUpFallbackRedirectUrl: currentUrl,
          } : {}),
          // After sign-in Clerk "navigates" to its after-sign-in address,
          // which without a router is a full page load that wipes the prompt
          // being typed. Keep the page put after auth, while still allowing
          // Clerk's OAuth/SSO callback and task routes to proceed.
          routerPush: navigate,
          routerReplace: navigate,
          appearance: APPEARANCE,
          localization: {
            signIn: { start: { subtitle: 'Sign in with Google or GitHub to use Free AI.' } },
            signUp: { start: { subtitle: 'Sign in with Google or GitHub to use Free AI.' } },
          },
        });
        keepSignInOpen();
        return instance;
      })()]);
      clerk.addListener(({ session }) => {
        // Signed in: the sign-in modal has done its job (Clerk would otherwise
        // leave it to the navigation that no longer happens).
        if (session) clerk.closeSignIn();
        notify();
      });
      syncWhenVisible(clerk);
      notify();
      return clerk;
    } catch (err) {
      logError('Could not load the Free AI sign-in', err);
      throw new Error(SIGN_IN_UNAVAILABLE);
    } finally {
      clearTimeout(timer);
    }
  })();
  return clerkPromise;
};

// { required, signedIn, name } for Settings → AI. Loads Clerk only if the
// server asks for sign-in.
export const freeSignInState = async () => {
  const clerk = await loadFreeSignIn();
  if (!clerk) return { required: false, signedIn: false, name: '' };
  if (!clerk.isSignedIn) await syncClerkSession(clerk);
  const user = clerk.user;
  return {
    required: true,
    signedIn: Boolean(clerk.isSignedIn && clerk.session && user),
    name: user ? (user.primaryEmailAddress?.emailAddress || user.username || user.fullName || '') : '',
  };
};

// Opens Clerk's sign-in (Google or GitHub, in a popup), unless Clerk already
// holds an active session for this browser.
export const openFreeSignIn = async () => {
  const clerk = await loadFreeSignIn();
  if (!clerk) return false;
  if (await syncClerkSession(clerk, { forceReload: true })) return false;
  clerk.openSignIn(signInOptions());
  return true;
};

export const signOutOfFreeAi = async () => {
  const clerk = await loadFreeSignIn();
  await clerk?.signOut();
  notify();
};

// Before sending a prompt: true when it may go ahead (not Free AI, no sign-in
// needed, or signed in); otherwise opens the sign-in and returns false, so the
// user sends again once signed in. Rejects with SIGN_IN_UNAVAILABLE, for the
// caller to show, if the sign-in can't load.
export const ensureFreeSignIn = async () => {
  if (!usesFreeAi()) return true;
  const clerk = await loadFreeSignIn();
  if (!clerk) return true;
  if (await syncClerkSession(clerk)) return true;
  clerk.openSignIn(signInOptions());
  return false;
};

// Headers for a request the caller knows is Free AI: the signed-in
// session's token, or none (the server then answers 401 if it needs one).
export const freeSignInHeaders = async () => {
  try {
    const clerk = await loadFreeSignIn();
    if (!clerk) return {};
    if (!clerk.session) await syncClerkSession(clerk);
    const token = clerk.session ? await clerk.session.getToken() : null;
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch (err) {
    if (err?.message !== SIGN_IN_UNAVAILABLE) logError('Could not read the Free AI sign-in token', err);
    return {};
  }
};
