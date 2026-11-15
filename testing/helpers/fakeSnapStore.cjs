// Mock only the main-process Snap Store request; all other fetches run normally.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (url !== 'https://api.snapcraft.io/v2/snaps/info/appblips') return originalFetch(url, options);
  return new Response(JSON.stringify({ 'channel-map': [{
    version: '99.0.0',
    channel: { architecture: 'amd64', track: 'latest', risk: 'stable' },
  }] }));
};
