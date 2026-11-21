// Identifies the preview bridge's postMessage channel. Shared by the parent
// (../previewBridge.js and its importers) and the in-frame script, which has
// both values spliced into its prelude.
export const BRIDGE_CHANNEL = 'orion-preview-bridge';
export const BRIDGE_PROTOCOL_VERSION = 1;

// The page to open for the bridge's 'open-youtube' message (see
// swapYouTubeFrame). The payload comes from the generated page, so only an id
// of YouTube's own alphabet goes into a fixed youtube.com URL.
export const youTubeWatchUrl = (payload) => {
  const id = typeof payload?.id === 'string' ? payload.id : '';
  if (payload?.kind === 'video' && /^[A-Za-z0-9_-]{11}$/.test(id)) return `https://www.youtube.com/watch?v=${id}`;
  if (payload?.kind === 'list' && /^[A-Za-z0-9_-]{2,64}$/.test(id)) return `https://www.youtube.com/playlist?list=${id}`;
  return null;
};

// The page to open for the bridge's 'open-link' message: an outside link the
// visitor clicked in the preview, opened by the parent so the new tab isn't
// sandboxed. The payload comes from the generated page: only a plain http(s)
// address without credentials, and the parent opens it with noopener. The
// browser only lets the parent open a tab right after a real click, so a page
// can't open tabs on its own with this.
export const externalLinkUrl = (payload) => {
  const raw = typeof payload?.url === 'string' ? payload.url : '';
  if (!raw || raw.length > 4096) return null;
  try {
    const url = new URL(raw);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
};
