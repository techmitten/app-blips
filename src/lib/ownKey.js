// Whether this copy may use the person's own AI key (Settings → AI, the
// own-key path of onboarding, the key connectors). Off only in the browser
// version against a hosted server (accounts on, lib/accounts.js): there the
// server is plan users only and its saved-key routes answer 404, since one
// server-side key file can't belong to one of many visitors. The desktop and
// Android apps keep their keys on the device, so they always allow it, plans
// or not. Set once before the first render (main.jsx → detectAccounts).
//
// No imports on purpose: desktop.js reads this, and accounts.js imports
// desktop.js, so a module in between would be a cycle.
let allowed = true;

export const setOwnKeyAllowed = (value) => { allowed = Boolean(value); };
export const ownKeyAllowed = () => allowed;
