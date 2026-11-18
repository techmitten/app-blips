// Browser Free AI sign-in (src/lib/freeSignIn.js): session syncing before
// opening the modal, 401 fallback behavior, and selective Clerk route handling.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const storage = new Map();
const winListeners = new Map();
const docListeners = new Map();

globalThis.window = {
  location: { href: 'https://web.appblips.com/' },
  localStorage: {
    get length() { return storage.size; },
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)); },
    removeItem: (k) => { storage.delete(k); },
  },
  addEventListener: (type, fn) => {
    const list = winListeners.get(type) || [];
    list.push(fn);
    winListeners.set(type, list);
  },
};
globalThis.document = {
  visibilityState: 'visible',
  addEventListener: (type, fn) => {
    const list = docListeners.get(type) || [];
    list.push(fn);
    docListeners.set(type, list);
  },
};

const { shouldFollowClerkRoute, syncClerkSession } = await import('../src/lib/freeSignIn.js');

const stubClerk = ({
  signedInSessions = [],
  initialSession = null,
  lastActiveSessionId = null,
  token = 'jwt-token',
} = {}) => {
  const calls = { reload: 0, setActive: [], openSignIn: [], closeSignIn: 0, openUserProfile: [], closeUserProfile: 0, getToken: 0, deleteUser: 0 };
  const listeners = new Set();
  const client = {
    signedInSessions,
    lastActiveSessionId,
    async reload() {
      calls.reload += 1;
    },
  };
  const makeUser = () => ({
    fullName: 'Ada Lovelace',
    imageUrl: 'https://img.example/ada.png',
    primaryEmailAddress: { emailAddress: 'u@example.com' },
    async delete() { calls.deleteUser += 1; },
  });
  const instance = {
    client,
    session: initialSession,
    user: initialSession ? makeUser() : null,
    get isSignedIn() {
      return Boolean(this.session && this.session.status !== 'pending');
    },
    async load(opts) {
      calls.loadOpts = opts;
    },
    addListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async setActive({ session }) {
      calls.setActive.push(session);
      this.session = session;
      this.user = session ? makeUser() : null;
      for (const fn of listeners) fn({ session });
    },
    openSignIn(opts) {
      calls.openSignIn.push(opts);
    },
    closeSignIn() {
      calls.closeSignIn += 1;
    },
    openUserProfile(opts) {
      calls.openUserProfile.push(opts);
    },
    closeUserProfile() {
      calls.closeUserProfile += 1;
    },
  };
  if (initialSession && !initialSession.getToken) {
    initialSession.getToken = async () => { calls.getToken += 1; return token; };
  }
  for (const s of signedInSessions) {
    if (!s.getToken) s.getToken = async () => { calls.getToken += 1; return token; };
  }
  return { instance, calls };
};

const loadFreshModule = async (caseId, clerkStub, fetchMock) => {
  globalThis.fetch = fetchMock ?? (async () => new Response(JSON.stringify({
    id: '',
    hasKey: false,
    envConfigured: true,
    freeSignIn: { publishableKey: 'pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk' },
  }), { headers: { 'content-type': 'application/json' } }));

  const mod = await import(`../src/lib/freeSignIn.js?case=${caseId}`);
  class FakeClerk {
    constructor() { return clerkStub.instance; }
  }
  await mod.loadFreeSignIn({ importClerk: async () => [{ Clerk: FakeClerk }, { ui: {} }] });
  return mod;
};

test('shouldFollowClerkRoute ignores post-auth home redirects and allows Clerk flow routes', () => {
  const signedOut = { isSignedIn: false };
  const signedIn = { isSignedIn: true };
  assert.equal(shouldFollowClerkRoute('/', signedOut, 'https://web.appblips.com/'), false);
  assert.equal(shouldFollowClerkRoute('/', signedIn, 'https://web.appblips.com/'), false);
  assert.equal(shouldFollowClerkRoute('/#/sso-callback?code=1', signedOut, 'https://web.appblips.com/'), true);
  assert.equal(shouldFollowClerkRoute('/?__clerk_handshake=abc', signedOut, 'https://web.appblips.com/'), true);
  assert.equal(shouldFollowClerkRoute('/create/continue', signedOut, 'https://web.appblips.com/'), true);
  assert.equal(shouldFollowClerkRoute('/tasks/choose-organization', signedIn, 'https://web.appblips.com/'), true);
  assert.equal(shouldFollowClerkRoute('https://accounts.appblips.com/sign-in', signedOut, 'https://web.appblips.com/'), true);
});

test('syncClerkSession activates an active session found on client.reload() without opening sign-in', async () => {
  const activeSession = { id: 'sess_1', status: 'active' };
  const { instance, calls } = stubClerk({ signedInSessions: [] });
  instance.client.reload = async () => {
    calls.reload += 1;
    instance.client.signedInSessions = [activeSession];
    instance.client.lastActiveSessionId = 'sess_1';
  };

  const ok = await syncClerkSession(instance);
  assert.equal(ok, true);
  assert.equal(calls.reload, 1);
  assert.equal(calls.setActive.length, 1);
  assert.equal(calls.setActive[0].id, 'sess_1');
  assert.equal(calls.closeSignIn, 1);
});

test('ensureFreeSignIn and openFreeSignIn do not open modal when Clerk already holds an active session', async () => {
  const activeSession = { id: 'sess_active', status: 'active' };
  const stub = stubClerk({ signedInSessions: [] });
  // Simulate a session created in a popup/another tab after initial Clerk load.
  stub.instance.client.reload = async () => {
    stub.calls.reload += 1;
    stub.instance.client.signedInSessions = [activeSession];
    stub.instance.client.lastActiveSessionId = 'sess_active';
  };

  const mod = await loadFreshModule('already-signed-in', stub);
  assert.equal(await mod.ensureFreeSignIn(), true);
  assert.equal(stub.calls.openSignIn.length, 0);
  assert.equal(stub.instance.isSignedIn, true);

  // Even a 401 fallback calling openFreeSignIn() reloads first and stays closed if still signed in.
  assert.equal(await mod.openFreeSignIn(), false);
  assert.equal(stub.calls.reload, 2);
  assert.equal(stub.calls.openSignIn.length, 0);
});

test('ensureFreeSignIn opens sign-in with current-page fallback redirect when truly signed out', async () => {
  const stub = stubClerk({ signedInSessions: [] });
  const mod = await loadFreshModule('signed-out', stub);

  assert.equal(await mod.ensureFreeSignIn(), false);
  assert.equal(stub.calls.openSignIn.length, 1);
  assert.deepEqual(stub.calls.openSignIn[0], {
    oauthFlow: 'popup',
    oidcPrompt: 'select_account',
    fallbackRedirectUrl: 'https://web.appblips.com/',
    signInFallbackRedirectUrl: 'https://web.appblips.com/',
    signUpFallbackRedirectUrl: 'https://web.appblips.com/',
  });
});

test('routerPush keeps the page put after sign-in while forwarding Clerk callback routes', async () => {
  const activeSession = { id: 'sess_nav', status: 'active' };
  const stub = stubClerk({ signedInSessions: [activeSession], initialSession: activeSession });
  const mod = await loadFreshModule('router', stub);
  assert.ok(mod);

  const navigated = [];
  const windowNavigate = (url) => navigated.push(url);
  stub.calls.loadOpts.routerPush('/', { windowNavigate });
  assert.deepEqual(navigated, []);
  assert.equal(stub.calls.closeSignIn, 1);

  stub.instance.session = null;
  stub.calls.loadOpts.routerPush('/#/sso-callback?code=abc', { windowNavigate });
  assert.deepEqual(navigated, ['/#/sso-callback?code=abc']);
});

test('freeSignInHeaders syncs session before getToken and handles getToken errors gracefully', async () => {
  const activeSession = {
    id: 'sess_hdr',
    status: 'active',
    async getToken() { return 'tok_123'; },
  };
  const stub = stubClerk({ signedInSessions: [activeSession] });
  const mod = await loadFreshModule('headers-ok', stub);
  assert.deepEqual(await mod.freeSignInHeaders(), { authorization: 'Bearer tok_123' });

  const failingSession = {
    id: 'sess_fail',
    status: 'active',
    async getToken() { throw new Error('network down'); },
  };
  const stubErr = stubClerk({ signedInSessions: [failingSession], initialSession: failingSession });
  const modErr = await loadFreshModule('headers-err', stubErr);
  const origError = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await modErr.freeSignInHeaders(), {});
  } finally {
    console.error = origError;
  }
});

test('freeSignInState reports user profile fields and openFreeAccountDashboard opens UserProfile', async () => {
  const activeSession = { id: 'sess_prof', status: 'active' };
  const stub = stubClerk({ signedInSessions: [activeSession], initialSession: activeSession });
  const mod = await loadFreshModule('profile', stub);

  assert.deepEqual(await mod.freeSignInState(), {
    required: true,
    signedIn: true,
    name: 'u@example.com',
    displayName: 'Ada Lovelace',
    email: 'u@example.com',
    imageUrl: 'https://img.example/ada.png',
  });

  assert.equal(await mod.openFreeAccountDashboard(), true);
  assert.equal(stub.calls.openUserProfile.length, 1);

  const signedOutStub = stubClerk({ signedInSessions: [] });
  const signedOutMod = await loadFreshModule('profile-out', signedOutStub);
  assert.equal(await signedOutMod.openFreeAccountDashboard(), false);
  assert.equal(signedOutStub.calls.openUserProfile.length, 0);
  assert.equal(signedOutStub.calls.openSignIn.length, 1);
});

test('deleteFreeAccount deletes user and clears session, or falls back to UserProfile on reverification', async () => {
  const activeSession = { id: 'sess_del', status: 'active' };
  const stub = stubClerk({ signedInSessions: [activeSession], initialSession: activeSession });
  const mod = await loadFreshModule('delete-ok', stub);

  let changes = 0;
  mod.onFreeSignInChange(() => { changes += 1; });
  assert.deepEqual(await mod.deleteFreeAccount(), { deleted: true });
  assert.equal(stub.calls.deleteUser, 1);
  assert.equal(stub.instance.session, null);
  assert.ok(stub.calls.closeUserProfile >= 1);
  assert.ok(changes >= 1);

  const revSession = { id: 'sess_rev', status: 'active' };
  const revStub = stubClerk({ signedInSessions: [revSession], initialSession: revSession });
  revStub.instance.user.delete = async () => {
    const err = new Error('Reverification required');
    err.errors = [{ code: 'session_reverification_required' }];
    throw err;
  };
  const revMod = await loadFreshModule('delete-reverify', revStub);
  assert.deepEqual(await revMod.deleteFreeAccount(), { deleted: false, needsReverification: true });
  assert.equal(revStub.calls.openUserProfile.length, 1);
  assert.equal(revStub.instance.session.id, 'sess_rev');
});
