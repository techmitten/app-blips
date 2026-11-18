// The Free option's sign-in settings (freeAuth.js has the full story). No
// dependencies, so providerApi.js can report them without bringing Clerk's
// server library into the app bundle (the Android app runs providerApi.js in
// its page, src/lib/android.js).

const read = (env, name) => String(env?.[name] ?? '').trim();

const isCompletePem = (value) => value && (!value.includes('-----BEGIN') || value.includes('-----END'));

// Extracts an unquoted multiline PEM for `key` from raw .env text, since
// Vite's loadEnv and Node's loadEnvFile stop at the first newline.
export const readUnquotedPemFromDotenv = (content, key = 'CLERK_JWT_KEY') => {
  if (!content) return '';
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(content).match(
    new RegExp(`^${escapedKey}=(-----BEGIN [A-Z0-9 ]+-----[\\s\\S]*?-----END [A-Z0-9 ]+-----)`, 'm'),
  );
  return match ? match[1].replace(/\r\n/g, '\n').trim() : '';
};

// Repairs a truncated multiline PEM in `env` using the raw .env file text.
export const withDotenvPemFallback = (env, dotenvContent) => {
  const current = read(env, 'CLERK_JWT_KEY');
  if (!current || isCompletePem(current)) return env;
  const repaired = readUnquotedPemFromDotenv(dotenvContent, 'CLERK_JWT_KEY');
  return repaired ? { ...env, CLERK_JWT_KEY: repaired } : env;
};

// The sign-in settings, or null when Free AI needs no sign-in here.
export const freeSignInConfig = (env) => {
  if (/^off$/i.test(read(env, 'APPBLIPS_FREE_SIGN_IN'))) return null;
  const publishableKey = read(env, 'CLERK_PUBLISHABLE_KEY') || read(env, 'VITE_CLERK_PUBLISHABLE_KEY');
  const isTestPub = publishableKey.startsWith('pk_test_');
  const isLivePub = publishableKey.startsWith('pk_live_');
  if (!isTestPub && !isLivePub) return null;
  // Hosts often store a PEM on one line with literal \n. Unquoted multiline
  // PEMs in .env are truncated by dotenv/loadEnv to just the BEGIN line.
  const rawJwtKey = read(env, 'CLERK_JWT_KEY').replace(/\\n/g, '\n');
  const jwtKey = isCompletePem(rawJwtKey) ? rawJwtKey : '';
  const rawSecretKey = read(env, 'CLERK_SECRET_KEY');
  const matchingSecretPrefix = isTestPub ? 'sk_test_' : 'sk_live_';
  const secretKey = rawSecretKey.startsWith(matchingSecretPrefix) ? rawSecretKey : '';
  if (!jwtKey && !secretKey) return null;
  return {
    publishableKey,
    ...(jwtKey ? { jwtKey } : {}),
    ...(secretKey ? { secretKey } : {}),
  };
};

// What GET /api/provider tells the page (providerApi.js): the public key only.
export const freeSignInStatus = (env) => {
  const config = freeSignInConfig(env);
  return config ? { freeSignIn: { publishableKey: config.publishableKey } } : {};
};
