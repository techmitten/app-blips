// Cross-platform onboarding survey endpoint (POST /api/onboarding).
// Stores each submission in Cloudflare D1 (`env.DB`) and, when configured,
// forwards a copy asynchronously to a Google Apps Script Web App webhook so
// rows appear in Google Sheets without slowing down the user's setup.

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

const VALID_PLATFORMS = new Set(['web', 'desktop', 'android']);
const MAX_FIELD_LEN = 120;

const cleanField = (value, max = MAX_FIELD_LEN) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const json = (status, body) => Response.json(body, { status, headers: CORS_HEADERS });

async function forwardToSheets(env, row) {
  const url = String(env.ONBOARDING_SHEETS_WEBHOOK_URL || '').trim();
  if (!url) return;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...row,
        secret: String(env.ONBOARDING_SHEETS_SECRET || ''),
      }),
    });
    if (!response.ok) {
      console.error('[onboarding] Google Sheets webhook returned', response.status);
    }
  } catch (err) {
    console.error('[onboarding] Google Sheets webhook failed:', err);
  }
}

export async function handleOnboardingApi(request, env, ctx) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { error: 'Expected a JSON object.' });
  }

  const clientId = cleanField(body.clientId, 64) || crypto.randomUUID();
  const rawPlatform = cleanField(body.platform, 16).toLowerCase();
  const platform = VALID_PLATFORMS.has(rawPlatform) ? rawPlatform : 'web';
  const goal = cleanField(body.goal);
  const role = cleanField(body.role);
  const experience = cleanField(body.experience);
  const appVersion = cleanField(body.appVersion, 32);

  if (!goal && !role && !experience) {
    return json(400, { error: 'At least one survey answer is required.' });
  }

  if (!env.DB) {
    console.error('[onboarding] D1 binding DB is not configured.');
    return json(503, { error: 'Storage is not configured.' });
  }

  const createdAt = new Date().toISOString();
  await env.DB
    .prepare(
      'INSERT INTO onboarding_responses (client_id, platform, goal, role, experience, app_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(clientId, platform, goal, role, experience, appVersion, createdAt)
    .run();

  const row = { clientId, platform, goal, role, experience, appVersion, createdAt };
  if (ctx?.waitUntil) ctx.waitUntil(forwardToSheets(env, row));
  else await forwardToSheets(env, row);

  return json(201, { ok: true });
}
