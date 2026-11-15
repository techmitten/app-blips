// Turnstile relay: a Cloudflare Worker that passes AppBlips' Turnstile
// confirmations on to Cloudflare's siteverify endpoint and returns its answer.
//
// Why: the Hugging Face Space can't reach challenges.cloudflare.com (its
// connections there time out), but it can reach Cloudflare-hosted addresses,
// and a Worker runs inside Cloudflare, where siteverify is always reachable.
// Point the server at it with TURNSTILE_VERIFY_URL (electron/server/freePass.js).
//
// It keeps no secret: the server sends its TURNSTILE_SECRET_KEY with each
// request, exactly as it would to Cloudflare directly, and the relay only
// forwards it. Without a valid secret, siteverify answers { success: false },
// so the relay is useless to anyone else.
//
// Deploy (Cloudflare dashboard): Workers & Pages → Create → Worker, paste
// this file in place of the sample, Deploy. Then Settings → Domains & Routes →
// Add → Custom domain (for example verify.appblips.com). Set
// TURNSTILE_VERIFY_URL=https://verify.appblips.com on the server.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_BODY_BYTES = 16 * 1024;

export default {
  async fetch(request) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) return new Response('Request too large', { status: 413 });
    const answer = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': request.headers.get('content-type') || 'application/x-www-form-urlencoded' },
      body,
    });
    return new Response(answer.body, {
      status: answer.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  },
};
