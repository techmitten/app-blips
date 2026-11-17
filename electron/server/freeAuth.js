// Sign-in for the Free option (the host's own AI key) on a public server:
// with CLERK_PUBLISHABLE_KEY and CLERK_JWT_KEY set, a Free AI request must
// carry a Clerk session token (Google or GitHub sign-in, src/lib/freeSignIn.js),
// and its allowance is counted per signed-in user instead of per address.
// Requests with the visitor's own API key never need it, and a server without
// these variables (npm start, Docker, the desktop app) works as before.
//
//   CLERK_PUBLISHABLE_KEY  pk_live_… / pk_test_…, sent to the page to load Clerk
//   CLERK_JWT_KEY          the instance's PEM public key (Clerk dashboard →
//                          API keys → JWT public key), so tokens are checked
//                          here with no request to Clerk
//   APPBLIPS_FREE_SIGN_IN  'off' turns it off while the keys stay set
//
// Fetch primitives and @clerk/backend only, so server.js and the Cloudflare
// Worker share it. The desktop app doesn't load it.
import { verifyToken } from '@clerk/backend';
import { freeSignInConfig } from './freeSignInConfig.js';

export { freeSignInConfig, freeSignInStatus } from './freeSignInConfig.js';

const read = (env, name) => String(env?.[name] ?? '').trim();

export const SIGN_IN_REQUIRED = 'Sign in with Google or GitHub to use Free AI. You can also use your own API key in Settings → AI.';

// Checks a Free AI request: { user } (the Clerk user id), or { refused }
// with the error to send (401). `request` is a Fetch Request. Tokens must be
// signed by the instance's key, unexpired, and issued to this page's own
// origin (or one in APPBLIPS_CHAT_ALLOWED_ORIGINS).
export async function checkFreeSignIn(request, env, { verify = verifyToken } = {}) {
  const config = freeSignInConfig(env);
  if (!config) return { user: null };
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return { refused: SIGN_IN_REQUIRED };
  let origin = '';
  try { origin = new URL(request.url).origin; } catch { /* no origin: only the allowed list */ }
  const authorizedParties = [origin, ...read(env, 'APPBLIPS_CHAT_ALLOWED_ORIGINS').split(',').map((o) => o.trim())].filter(Boolean);
  try {
    const claims = await verify(token, { jwtKey: config.jwtKey, authorizedParties });
    if (typeof claims?.sub !== 'string' || !claims.sub) return { refused: SIGN_IN_REQUIRED };
    return { user: claims.sub };
  } catch {
    // Expired, for another site, or not Clerk's: the page signs in again.
    return { refused: SIGN_IN_REQUIRED };
  }
}
