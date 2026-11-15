import { compareVersions, CHECK_INTERVAL_MS, SNAP_STORE_URL } from '../src/lib/updates.js';

// Check the production Snap Store release, independently of GitHub drafts/tags.
// Run in main so the Store's required headers don't depend on browser CORS.
export function createSnapUpdateCheck({ fetchImpl = fetch, arch = process.arch, now = Date.now } = {}) {
  const architecture = { x64: 'amd64', arm64: 'arm64', arm: 'armhf', ia32: 'i386' }[arch] || arch;
  let cached = null;
  return async ({ current, force = false }) => {
    if (!cached || force || now() - cached.checkedAt >= CHECK_INTERVAL_MS) {
      const response = await fetchImpl('https://api.snapcraft.io/v2/snaps/info/appblips', {
        headers: { 'Snap-Device-Series': '16', 'Snap-Device-Architecture': architecture },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Snap Store answered ${response.status}`);
      const json = await response.json();
      if (!Array.isArray(json?.['channel-map'])) throw new Error('Invalid Snap Store response');
      const stable = json['channel-map'].find(({ channel }) => channel?.architecture === architecture
        && channel.track === 'latest' && channel.risk === 'stable');
      cached = { checkedAt: now(), version: stable?.version || null };
    }
    return cached.version && compareVersions(cached.version, current) > 0
      ? { version: cached.version, url: SNAP_STORE_URL, snap: true }
      : null;
  };
}
