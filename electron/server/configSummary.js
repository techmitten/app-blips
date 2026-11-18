// Human-readable summary of the server configuration, printed once at startup
// (the desktop app, and the Vite dev server) so a misconfiguration shows up as
// an actionable line in the terminal instead of a failed first request.
//
// Never includes secret values: only provider names, models, endpoints and the
// names of variables that still need filling in.
import { resolveProvider, LLM_ENV } from './providers.js';
import { freeSignInConfig } from './freeSignInConfig.js';

const describeProvider = (provider) => `${provider.label} · ${provider.model || 'newest model (set OPENAI_LLM_MODEL to choose)'} · ${provider.baseUrl}`;

// Returns [{ level: 'info' | 'warn' | 'error', label?, text }].
export const describeConfig = (env, { isDev = false } = {}) => {
  const lines = [];

  const builder = resolveProvider(env, 'APPBLIPS_LLM', { quiet: true });
  if (builder.unconfigured) {
    // A copy can run without one: users pick a provider in the app.
    lines.push({ level: 'warn', label: 'Builder AI', text: 'No provider in .env. Set one there, or pick one in the app under Settings → AI.' });
  } else if (builder.error) {
    lines.push({ level: 'error', label: 'Builder AI', text: builder.error });
  } else if (builder.missing.length) {
    lines.push({
      level: 'error',
      label: 'Builder AI',
      text: `${builder.label} is selected but ${builder.missing.join(', ')} ${builder.missing.length > 1 ? 'are' : 'is'} empty. Add ${builder.missing.length > 1 ? 'them' : 'it'} to your .env.`,
    });
  } else {
    lines.push({ level: 'info', label: 'Builder AI', text: describeProvider(builder) });
  }
  if (!builder.error && builder.alsoConfigured?.length) {
    lines.push({
      level: 'warn',
      text: `Several provider keys are set (${[builder.id, ...builder.alsoConfigured].join(', ')}); using ${builder.id}. Set ${LLM_ENV.PROVIDER} to choose.`,
    });
  }

  const rawJwtKey = String(env?.CLERK_JWT_KEY ?? '').trim();
  const truncatedJwt = rawJwtKey.includes('-----BEGIN') && !rawJwtKey.includes('-----END');
  if (truncatedJwt) {
    lines.push({
      level: 'warn',
      label: 'Free sign-in',
      text: 'CLERK_JWT_KEY looks truncated (multiline PEM values in .env must be quoted or use \\n on one line).',
    });
  }
  const publishable = String(env?.CLERK_PUBLISHABLE_KEY ?? env?.VITE_CLERK_PUBLISHABLE_KEY ?? '').trim();
  const secretKey = String(env?.CLERK_SECRET_KEY ?? '').trim();
  const signIn = freeSignInConfig(env);
  if (signIn) {
    if (isDev && signIn.publishableKey.startsWith('pk_live_')) {
      lines.push({
        level: 'warn',
        label: 'Free sign-in',
        text: 'Live Clerk key (pk_live_…) is set; Clerk blocks live keys on localhost/127.0.0.1. Use a pk_test_… key in .env to sign in locally.',
      });
    } else {
      lines.push({
        level: 'info',
        label: 'Free sign-in',
        text: `Clerk (${signIn.publishableKey.startsWith('pk_test_') ? 'test' : 'live'} key)`,
      });
    }
  } else if (publishable && !/^off$/i.test(String(env?.APPBLIPS_FREE_SIGN_IN ?? '').trim())) {
    const isTestPub = publishable.startsWith('pk_test_');
    const mismatchedSecret = (isTestPub && secretKey.startsWith('sk_live_')) || (!isTestPub && secretKey.startsWith('sk_test_'));
    lines.push({
      level: 'warn',
      label: 'Free sign-in',
      text: mismatchedSecret
        ? `Publishable key (${isTestPub ? 'pk_test_…' : 'pk_live_…'}) does not match CLERK_SECRET_KEY (${secretKey.slice(0, 8)}…). Add the matching CLERK_JWT_KEY or ${isTestPub ? 'sk_test_…' : 'sk_live_…'} key.`
        : 'Clerk publishable key is set without a matching CLERK_JWT_KEY (or CLERK_SECRET_KEY), so sign-in is off.',
    });
  }

  return lines;
};

// Plain-text block for the terminal.
export const formatConfigSummary = (lines) => {
  const mark = { info: ' ', warn: '!', error: 'x' };
  const body = lines.map(({ level, label, text }) => {
    const head = label ? `${label} ${'.'.repeat(Math.max(2, 12 - label.length))} ` : '';
    return `  ${mark[level]} ${head}${text}`;
  });
  return ['AppBlips configuration', ...body].join('\n');
};
