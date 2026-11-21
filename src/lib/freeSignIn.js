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
export const LOCALHOST_LIVE_KEY_UNAVAILABLE = 'Clerk live keys (pk_live_…) do not allow localhost or 127.0.0.1. Use a Clerk test key (pk_test_…) in .env to test sign-in locally.';

const isLoopbackHost = () => {
  if (typeof window === 'undefined') return false;
  const host = window.location?.hostname?.toLowerCase() || '';
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
};

const CLERK_FLOW_PATTERN = /(?:__clerk_|\/(?:sso-callback|factor-|reset-password|verify|continue|tasks|create)(?:[/?#]|$))/i;
const SIGNED_IN_HINT_KEY = 'appblips-free-signed-in';

const setSignedInHint = (signedIn) => {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_HINT_KEY, '1');
    else localStorage.removeItem(SIGNED_IN_HINT_KEY);
  } catch { /* storage blocked */ }
};

// True when this browser may already hold a Clerk session (or is mid-OAuth
// callback) so we should hydrate Clerk automatically on startup. Fresh
// visitors with no session skip downloading @clerk/clerk-js and @clerk/ui
// until they click Sign in or send a Free AI prompt.
const hasPossibleFreeSession = () => {
  if (clerkPromise) return true;
  if (typeof window === 'undefined') return true;
  try {
    if (localStorage.getItem(SIGNED_IN_HINT_KEY) === '1') return true;
  } catch { /* storage blocked */ }
  try {
    if (typeof document !== 'undefined' && /(?:^|;\s*)__client_uat=[1-9]\d*/.test(document.cookie || '')) {
      return true;
    }
  } catch { /* cookie access blocked */ }
  const loc = window.location;
  if (loc && CLERK_FLOW_PATTERN.test(`${loc.pathname || ''}${loc.search || ''}${loc.hash || ''}`)) {
    return true;
  }
  return false;
};

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
// Also keep users on their OAuth account by hiding email edits in Profile
// details and the password section in Security.
const APPEARANCE = {
  elements: {
    modalBackdrop: { width: '100%', alignItems: 'center' },
    modalContent: { margin: 'auto' },
    profileSectionPrimaryButton__emailAddresses: { display: 'none' },
    profileSectionItem__emailAddresses: {
      '& .cl-menuButton': { display: 'none' },
    },
    profileSection__password: { display: 'none' },
    profileSectionPrimaryButton__password: { display: 'none' },
  },
};

export const OAUTH_EMAIL_LOCKED_MESSAGE = 'Your email address is tied to your OAuth account and cannot be added or changed.';
export const OAUTH_PASSWORD_LOCKED_MESSAGE = 'Passwords are disabled; sign in with your OAuth account.';

const lockedEnvironments = new WeakSet();
const lockedUsers = new WeakSet();
const lockedEmails = new WeakSet();
const wrappedClerks = new WeakSet();

const lockedError = (message, code) => {
  const err = new Error(message);
  err.code = code;
  return err;
};

const lockEnvironmentAttributes = (env) => {
  const attrs = env?.userSettings?.attributes;
  if (!attrs || typeof attrs !== 'object' || lockedEnvironments.has(attrs)) return;
  lockedEnvironments.add(attrs);
  const setAttrProp = (attr, key, value) => {
    if (!attr || typeof attr !== 'object') return;
    try {
      attr[key] = value;
    } catch {
      // Ignore frozen environment objects; APPEARANCE still hides the controls.
    }
  };
  setAttrProp(attrs.email_address, 'immutable', true);
  setAttrProp(attrs.password, 'enabled', false);
  setAttrProp(attrs.password, 'required', false);
};

const lockUserMethods = (user) => {
  if (!user || typeof user !== 'object') return;
  if (!lockedUsers.has(user)) {
    lockedUsers.add(user);
    if (typeof user.createEmailAddress === 'function') {
      user.createEmailAddress = async () => {
        throw lockedError(OAUTH_EMAIL_LOCKED_MESSAGE, 'oauth_email_locked');
      };
    }
    if (typeof user.updatePassword === 'function') {
      user.updatePassword = async () => {
        throw lockedError(OAUTH_PASSWORD_LOCKED_MESSAGE, 'oauth_password_locked');
      };
    }
    if (typeof user.update === 'function') {
      const originalUpdate = user.update.bind(user);
      user.update = async (params, ...rest) => {
        if (
          params
          && typeof params === 'object'
          && Object.prototype.hasOwnProperty.call(params, 'primaryEmailAddressId')
          && params.primaryEmailAddressId !== user.primaryEmailAddressId
        ) {
          throw lockedError(OAUTH_EMAIL_LOCKED_MESSAGE, 'oauth_email_locked');
        }
        return originalUpdate(params, ...rest);
      };
    }
  }
  if (Array.isArray(user.emailAddresses)) {
    for (const email of user.emailAddresses) {
      if (email && typeof email === 'object' && !lockedEmails.has(email)) {
        lockedEmails.add(email);
        if (typeof email.destroy === 'function') {
          email.destroy = async () => {
            throw lockedError(OAUTH_EMAIL_LOCKED_MESSAGE, 'oauth_email_locked');
          };
        }
      }
    }
  }
};

/**
 * Locks OAuth-only account fields on a Clerk instance so users cannot add,
 * remove, or change email addresses or set a password.
 */
export const lockOAuthAccount = (clerk) => {
  if (!clerk) return;
  lockEnvironmentAttributes(clerk.__internal_environment);
  lockEnvironmentAttributes(clerk.environment);
  if (!wrappedClerks.has(clerk)) {
    wrappedClerks.add(clerk);
    if (typeof clerk.updateEnvironment === 'function') {
      const originalUpdateEnvironment = clerk.updateEnvironment.bind(clerk);
      clerk.updateEnvironment = (env, ...rest) => {
        lockEnvironmentAttributes(env);
        return originalUpdateEnvironment(env, ...rest);
      };
    }
  }
  lockUserMethods(clerk.user);
};

// A press outside the sign-in modal would close it (Clerk has no setting for
// this). Clerk closes it only for a press on its backdrop element itself, so
// swallow those at the window, before Clerk's listener on the document sees
// them. Only apply this to Sign-In / Sign-Up modals so the Account Dashboard
// (UserProfile) modal can still be dismissed by clicking outside.
const keepSignInOpen = () => {
  const swallow = (event) => {
    if (
      event.target instanceof Element
      && event.target.classList.contains('cl-modalBackdrop')
      && event.target.querySelector('.cl-signIn-root, .cl-signUp-root')
    ) {
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
  if (!forceReload && clerk.isSignedIn && clerk.session) {
    lockOAuthAccount(clerk);
    return true;
  }
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
      lockOAuthAccount(clerk);
      setSignedInHint(Boolean(clerk.isSignedIn || clerk.session?.status === 'active'));
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
      lockOAuthAccount(clerk);
      clerk.addListener(({ session, user }) => {
        lockOAuthAccount(clerk);
        if (user) lockUserMethods(user);
        setSignedInHint(Boolean(session));
        // Signed in: the sign-in modal has done its job (Clerk would otherwise
        // leave it to the navigation that no longer happens).
        if (session) clerk.closeSignIn();
        else clerk.closeUserProfile?.();
        notify();
      });
      syncWhenVisible(clerk);
      notify();
      return clerk;
    } catch (err) {
      logError('Could not load the Free AI sign-in', err);
      if (isLoopbackHost() && config.publishableKey.startsWith('pk_live_')) {
        throw new Error(LOCALHOST_LIVE_KEY_UNAVAILABLE);
      }
      throw new Error(SIGN_IN_UNAVAILABLE);
    } finally {
      clearTimeout(timer);
    }
  })();
  return clerkPromise;
};

// { required, signedIn, name, displayName, email, imageUrl } for UI indicators
// and Settings → AI. When `eager` is false, avoids loading the Clerk bundles
// until the browser has a session hint or the user triggers sign-in.
export const freeSignInState = async ({ eager = true } = {}) => {
  if (!eager && !hasPossibleFreeSession()) {
    const config = await freeSignInConfig();
    return { required: Boolean(config), signedIn: false, name: '', displayName: '', email: '', imageUrl: '' };
  }
  const clerk = await loadFreeSignIn();
  if (!clerk) return { required: false, signedIn: false, name: '', displayName: '', email: '', imageUrl: '' };
  if (!clerk.isSignedIn) await syncClerkSession(clerk);
  const user = clerk.user;
  const signedIn = Boolean(clerk.isSignedIn && clerk.session && user);
  setSignedInHint(signedIn);
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const displayName = user ? (user.fullName || user.username || email || '') : '';
  return {
    required: true,
    signedIn,
    name: user ? (email || user.username || user.fullName || '') : '',
    displayName,
    email,
    imageUrl: user?.imageUrl || '',
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

// Opens Clerk's built-in UserProfile modal (Account Dashboard: profile,
// connected accounts, active sessions, and account deletion).
export const openFreeAccountDashboard = async () => {
  const clerk = await loadFreeSignIn();
  if (!clerk) return false;
  const signedIn = await syncClerkSession(clerk, { forceReload: true });
  if (!signedIn || !clerk.user) {
    clerk.openSignIn(signInOptions());
    return false;
  }
  lockOAuthAccount(clerk);
  clerk.openUserProfile({ appearance: APPEARANCE });
  return true;
};

const isReverificationError = (err) => Array.isArray(err?.errors)
  && err.errors.some((item) => item?.code === 'session_reverification_required');

// Permanently deletes the signed-in Clerk user account. If Clerk requires
// fresh OAuth reverification for an older session, opens Clerk's Account
// Dashboard so the user can reverify and complete deletion there.
export const deleteFreeAccount = async () => {
  const clerk = await loadFreeSignIn();
  if (!clerk) return { deleted: false };
  const signedIn = await syncClerkSession(clerk, { forceReload: true });
  if (!signedIn || !clerk.user) return { deleted: false };
  try {
    await clerk.user.delete();
  } catch (err) {
    if (isReverificationError(err)) {
      lockOAuthAccount(clerk);
      clerk.openUserProfile({ appearance: APPEARANCE });
      return { deleted: false, needsReverification: true };
    }
    throw err;
  }
  try {
    await clerk.setActive?.({ session: null });
  } catch (err) {
    logWarn('Could not clear the deleted session locally', err);
  }
  clerk.closeUserProfile?.();
  clerk.closeSignIn?.();
  notify();
  return { deleted: true };
};

export const signOutOfFreeAi = async () => {
  const clerk = await loadFreeSignIn();
  await clerk?.signOut();
  clerk?.closeUserProfile?.();
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
