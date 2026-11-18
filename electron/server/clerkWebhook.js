// Clerk webhook handler (POST /api/webhooks/clerk): verifies incoming Svix
// signatures from Clerk and syncs newly created or updated users into Resend's
// email list (audience). Shared by server.js and the Cloudflare Worker.
import { verifyWebhook } from '@clerk/backend/webhooks';

const RESEND_API_BASE = 'https://api.resend.com';
const SYNC_EVENTS = new Set(['user.created', 'user.updated']);
const audienceCache = new WeakMap();

const read = (env, name) => String(env?.[name] ?? '').trim();

const json = (status, body) => Response.json(body, { status });

function pickPrimaryEmail(data) {
  const emails = Array.isArray(data?.email_addresses) ? data.email_addresses : [];
  const primary = emails.find((entry) => entry?.id === data?.primary_email_address_id) || emails[0];
  return typeof primary?.email_address === 'string' ? primary.email_address.trim() : '';
}

async function resolveAudienceId(env, resendKey, fetchImpl) {
  const configured = read(env, 'RESEND_AUDIENCE_ID');
  if (configured) return configured;

  let byKey = audienceCache.get(fetchImpl);
  if (byKey?.has(resendKey)) return byKey.get(resendKey);

  const res = await fetchImpl(`${RESEND_API_BASE}/audiences`, {
    headers: { authorization: `Bearer ${resendKey}` },
  });
  if (!res.ok) {
    throw new Error(`Resend audiences lookup failed (${res.status})`);
  }
  const payload = await res.json().catch(() => null);
  const firstId = typeof payload?.data?.[0]?.id === 'string' ? payload.data[0].id : null;

  if (!byKey) {
    byKey = new Map();
    audienceCache.set(fetchImpl, byKey);
  }
  byKey.set(resendKey, firstId);
  return firstId;
}

/**
 * Handles incoming Clerk webhooks on POST /api/webhooks/clerk.
 * Verifies the Svix signature and adds/updates the user's primary email in Resend.
 */
export async function handleClerkWebhook(request, env, options = {}) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const signingSecret = read(env, 'CLERK_WEBHOOK_SIGNING_SECRET');
  if (!signingSecret) {
    return json(503, { error: 'Clerk webhook signing secret is not configured.' });
  }
  const resendKey = read(env, 'RESEND_API_KEY');
  if (!resendKey) {
    return json(503, { error: 'Resend API key is not configured.' });
  }

  const verify = options.verify ?? verifyWebhook;
  let event;
  try {
    event = await verify(request, { signingSecret });
  } catch {
    return json(400, { error: 'Invalid webhook signature.' });
  }

  const eventType = typeof event?.type === 'string' ? event.type : '';
  if (!SYNC_EVENTS.has(eventType)) {
    return json(200, { ok: true, ignored: eventType || 'unknown' });
  }

  const data = event?.data;
  const email = pickPrimaryEmail(data);
  if (!email) {
    return json(200, { ok: true, skipped: 'no-email' });
  }

  const contact = { email };
  if (typeof data?.first_name === 'string' && data.first_name.trim()) {
    contact.first_name = data.first_name.trim();
  }
  if (typeof data?.last_name === 'string' && data.last_name.trim()) {
    contact.last_name = data.last_name.trim();
  }
  if (eventType === 'user.created') {
    // Only initialize subscription status on creation so profile updates don't
    // re-subscribe someone who opted out in Resend.
    contact.unsubscribed = false;
  }

  const fetchImpl = options.fetch ?? fetch;
  try {
    const audienceId = await resolveAudienceId(env, resendKey, fetchImpl);
    const endpoint = audienceId
      ? `${RESEND_API_BASE}/audiences/${encodeURIComponent(audienceId)}/contacts`
      : `${RESEND_API_BASE}/contacts`;
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${resendKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(contact),
    });
    if (!res.ok) {
      console.error('[clerk-webhook] Resend sync failed:', res.status);
      return json(502, { error: 'Resend request failed.' });
    }
    const created = await res.json().catch(() => null);
    return json(200, { ok: true, event: eventType, contactId: created?.id ?? null });
  } catch (err) {
    console.error('[clerk-webhook] Resend sync error:', err?.message || err);
    return json(502, { error: 'Resend request failed.' });
  }
}
