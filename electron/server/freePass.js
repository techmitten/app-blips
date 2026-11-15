// Free passes: before the Free option (the server's own provider,
// OPENAI_API_KEY) answers someone, they pass a Cloudflare Turnstile check and
// get a signed pass for an hour. /api/chat and /api/web only spend the
// server's key for requests that carry a valid pass; requests with the
// visitor's own key never need one. This stops scripts from using the Free
// option as a free AI API (the Origin check in chatProxy.js only stops other
// websites, and freeLimits.js only caps how much each address uses).
//
// On only when both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set, so
// the desktop app, Docker and `npm start` without them work as before.
//
// A pass is "<expires ms>.<HMAC of visitor and expiry>". It is bound to the
// visitor (the address freeLimits.js counts, an IPv6 /64), so one solved check
// can't be shared across many addresses: each new address needs its own. The
// signing key is APPBLIPS_FREE_PASS_SECRET, or a random one per start (a
// restart then just means a new check).
//
// TURNSTILE_VERIFY_URL replaces Cloudflare's siteverify address, for a host
// that can't reach challenges.cloudflare.com (a Hugging Face Space can't): an
// https address that forwards to it, like cloudflare/turnstile-relay.js.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const FREE_PASS_HEADER = 'x-appblips-free-pass';
const PASS_MS = 60 * 60 * 1000;
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 10_000;
const MAX_TOKEN_LENGTH = 4096;

const trimmed = (value) => String(value ?? '').trim();

// What the Free option answers without a valid pass: the page runs the check
// with `siteKey` and retries (src/lib/freePass.js).
export const FREE_PASS_ERROR = 'Free AI needs a quick check that you’re a person. Reload the page and try again, or use your own API key in Settings → AI.';
export const freePassRefusal = (siteKey) => ({ error: FREE_PASS_ERROR, source: 'free-pass', siteKey });

// null when Turnstile isn't configured (no check needed). Warns when only one
// of the two keys is set, since that is a half-finished setup.
export function createFreePasses(env, { now = Date.now, fetch: fetchImpl = globalThis.fetch, warn = console.warn } = {}) {
  const siteKey = trimmed(env?.TURNSTILE_SITE_KEY);
  const secretKey = trimmed(env?.TURNSTILE_SECRET_KEY);
  if (!siteKey || !secretKey) {
    if (siteKey || secretKey) warn('[free-pass] Set both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY to require a check for Free AI; it stays off with only one.');
    return null;
  }
  const relay = trimmed(env?.TURNSTILE_VERIFY_URL);
  if (relay && !/^https:\/\/[^\s/]+/i.test(relay)) warn('[free-pass] TURNSTILE_VERIFY_URL must start with https://; using Cloudflare directly.');
  const verifyUrl = relay && /^https:\/\/[^\s/]+/i.test(relay) ? relay : SITEVERIFY_URL;
  const configured = trimmed(env?.APPBLIPS_FREE_PASS_SECRET);
  const signingKey = configured ? Buffer.from(configured) : randomBytes(32);
  const sign = (visitor, expires) => createHmac('sha256', signingKey).update(`${visitor}\n${expires}`).digest('base64url');

  const issue = (visitor) => {
    const expiresAt = now() + PASS_MS;
    return { pass: `${expiresAt}.${sign(visitor, expiresAt)}`, expiresAt };
  };

  // Is `pass` a valid, unexpired pass for this visitor?
  const check = (pass, visitor) => {
    const match = /^(\d{1,16})\.([A-Za-z0-9_-]{43})$/.exec(trimmed(pass));
    if (!match) return false;
    const expires = Number(match[1]);
    if (!(expires > now()) || expires > now() + PASS_MS) return false;
    const expected = Buffer.from(sign(visitor, expires));
    const given = Buffer.from(match[2]);
    return expected.length === given.length && timingSafeEqual(expected, given);
  };

  // Asks Cloudflare whether the Turnstile token from the page is genuine
  // (and unused: Cloudflare accepts each token once).
  const verify = async (token, ip) => {
    const form = new URLSearchParams({ secret: secretKey, response: token });
    if (ip) form.set('remoteip', ip);
    const response = await fetchImpl(verifyUrl, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => null);
    if (data?.success === true) return true;
    // Cloudflare's reason (error codes, never the token or secret), for
    // telling a bad setup from a failed check in the server log.
    const codes = Array.isArray(data?.['error-codes']) ? data['error-codes'].join(', ') : '';
    console.warn(`[free-pass] check rejected: HTTP ${response.status}${codes ? `, ${codes}` : data ? '' : ', not JSON'}${data?.hostname ? `, hostname ${data.hostname}` : ''}`);
    return false;
  };

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  // POST /api/free-pass { token } -> { pass, expiresAt }.
  const handle = async (request, { visitor, ip }) => {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const body = await request.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : '';
    if (!token || token.length > MAX_TOKEN_LENGTH) return json(400, { error: 'Missing the check’s answer.' });
    let ok;
    try {
      ok = await verify(token, ip);
    } catch (err) {
      console.warn('[free-pass] Turnstile verification failed:', err?.message || err);
      return json(502, { error: 'Couldn’t confirm the check with Cloudflare. Try again in a moment.' });
    }
    if (!ok) return json(403, { error: 'The check didn’t pass. Reload the page and try again.' });
    return json(200, issue(visitor));
  };

  return { siteKey, issue, check, handle };
}
