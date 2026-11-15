// The browser version's Free pass (electron/server/freePass.js): when the
// server answers a Free AI request with 403 { source: 'free-pass', siteKey },
// this runs a Cloudflare Turnstile check, trades its answer for a pass at
// /api/free-pass, and browserKeys.js retries the request with it. The pass
// lasts an hour and is kept for this tab (sessionStorage), so the check runs
// at most about once an hour, and usually without anything to click: the
// dialog only appears when Turnstile wants the person to interact.

export const FREE_PASS_HEADER = 'x-appblips-free-pass';
const STORAGE_KEY = 'appblips-free-pass';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const CHECK_TIMEOUT_MS = 2 * 60 * 1000;
// Refresh a little early, so a pass doesn't expire mid-request.
const EXPIRY_MARGIN_MS = 60 * 1000;

let held = null; // { pass, expiresAt }
const load = () => {
  if (held) return held;
  try { held = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch { held = null; }
  return held;
};
const save = (value) => {
  held = value;
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* storage blocked: kept in memory */ }
};

// The pass to send, or '' when there is none (or it is about to expire).
export const currentFreePass = () => {
  const value = load();
  if (!value || typeof value.pass !== 'string' || !(value.expiresAt - EXPIRY_MARGIN_MS > Date.now())) return '';
  return value.pass;
};

// Is `response` the server asking for a pass? Reads a clone, so the response
// itself can still be returned unread. -> the site key, or ''.
export async function freePassSiteKey(response) {
  if (response.status !== 403 || !(response.headers.get('content-type') || '').includes('application/json')) return '';
  const body = await response.clone().json().catch(() => null);
  return body?.source === 'free-pass' && typeof body.siteKey === 'string' ? body.siteKey : '';
}

let scriptLoading = null;
const loadTurnstile = () => {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptLoading) {
    scriptLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load.')));
      script.onerror = () => reject(new Error('Couldn’t load the check from Cloudflare.'));
      document.head.appendChild(script);
    }).catch((err) => {
      scriptLoading = null;
      throw err;
    });
  }
  return scriptLoading;
};

// The dialog the widget lives in: hidden unless Turnstile asks for a click.
const createDialog = (onCancel) => {
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'appblips-free-pass-title');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483000', display: 'none',
    alignItems: 'center', justifyContent: 'center', padding: '16px',
    background: 'rgba(15, 23, 42, 0.45)',
  });
  const card = document.createElement('div');
  Object.assign(card.style, {
    background: '#ffffff', color: '#0f172a', borderRadius: '12px', padding: '20px',
    maxWidth: '360px', width: '100%', boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
    font: '14px/1.45 system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: '12px',
  });
  const title = document.createElement('h2');
  title.id = 'appblips-free-pass-title';
  title.textContent = 'One quick check';
  // Colors set on each element: the app's own heading and text styles would win otherwise.
  Object.assign(title.style, { margin: '0', fontSize: '16px', fontWeight: '600', color: '#0f172a' });
  const text = document.createElement('p');
  text.textContent = 'Free AI checks now and then that you’re a person, to keep it free for everyone.';
  Object.assign(text.style, { margin: '0', color: '#334155' });
  const widget = document.createElement('div');
  widget.style.minHeight = '65px';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  Object.assign(cancel.style, {
    alignSelf: 'flex-end', padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
    background: '#ffffff', color: '#0f172a', cursor: 'pointer', font: 'inherit',
  });
  cancel.addEventListener('click', onCancel);
  card.append(title, text, widget, cancel);
  overlay.append(card);
  document.body.append(overlay);
  return {
    widget,
    show: () => { overlay.style.display = 'flex'; },
    hide: () => { overlay.style.display = 'none'; },
    remove: () => overlay.remove(),
  };
};

// Runs the check -> the Turnstile token. Rejects when it fails, times out or
// the person cancels.
const runCheck = async (siteKey) => {
  const turnstile = await loadTurnstile();
  return new Promise((resolve, reject) => {
    let widgetId = null;
    let settled = false;
    const finish = (error, token) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { if (widgetId != null) turnstile.remove(widgetId); } catch { /* already gone */ }
      dialog.remove();
      if (error) reject(error);
      else resolve(token);
    };
    const dialog = createDialog(() => finish(new Error('Check cancelled.')));
    const timer = setTimeout(() => finish(new Error('The check took too long.')), CHECK_TIMEOUT_MS);
    try {
      widgetId = turnstile.render(dialog.widget, {
        sitekey: siteKey,
        action: 'free-ai',
        appearance: 'interaction-only',
        callback: (token) => finish(null, token),
        'error-callback': () => finish(new Error('The check failed.')),
        'expired-callback': () => finish(new Error('The check expired.')),
        'timeout-callback': () => finish(new Error('The check timed out.')),
        'before-interactive-callback': dialog.show,
        'after-interactive-callback': dialog.hide,
      });
    } catch (err) {
      finish(err);
    }
  });
};

// One check at a time, however many requests are waiting for a pass.
let obtaining = null;
// -> the new pass. `fetchImpl` is the unwrapped fetch (browserKeys.js).
export function obtainFreePass(siteKey, fetchImpl) {
  if (!obtaining) {
    obtaining = (async () => {
      const token = await runCheck(siteKey);
      const response = await fetchImpl('/api/free-pass', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.pass !== 'string') throw new Error(body?.error || `The check couldn’t be confirmed (error ${response.status}).`);
      save({ pass: body.pass, expiresAt: Number(body.expiresAt) || Date.now() + 55 * 60 * 1000 });
      return body.pass;
    })().finally(() => { obtaining = null; });
  }
  return obtaining;
}

// For a pass the server no longer accepts (expired, or a new address).
export const forgetFreePass = () => save(null);
