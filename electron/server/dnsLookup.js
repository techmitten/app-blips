// Resolves a host name to its addresses for the handlers that fetch an
// address the user typed (seoScanApi.js): a public-looking name can point at
// a private address. Node only, so it is passed in from the Node hosts
// (server.js, the Vite dev server, electron/main.js); the Android app has no
// resolver and keeps the name check alone.
import { lookup } from 'node:dns/promises';

export const resolveAddresses = async (hostname) => {
  const found = await lookup(hostname, { all: true, verbatim: true });
  return found.map((entry) => entry.address);
};
