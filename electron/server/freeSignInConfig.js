// The Free option's sign-in settings (freeAuth.js has the full story). No
// dependencies, so providerApi.js can report them without bringing Clerk's
// server library into the app bundle (the Android app runs providerApi.js in
// its page, src/lib/android.js).

const read = (env, name) => String(env?.[name] ?? '').trim();

// The sign-in settings, or null when Free AI needs no sign-in here.
export const freeSignInConfig = (env) => {
  if (/^off$/i.test(read(env, 'APPBLIPS_FREE_SIGN_IN'))) return null;
  const publishableKey = read(env, 'CLERK_PUBLISHABLE_KEY');
  // Hosts often store a PEM on one line with literal \n.
  const jwtKey = read(env, 'CLERK_JWT_KEY').replace(/\\n/g, '\n');
  if (!/^pk_(live|test)_/.test(publishableKey) || !jwtKey) return null;
  return { publishableKey, jwtKey };
};

// What GET /api/provider tells the page (providerApi.js): the public key only.
export const freeSignInStatus = (env) => {
  const config = freeSignInConfig(env);
  return config ? { freeSignIn: { publishableKey: config.publishableKey } } : {};
};
