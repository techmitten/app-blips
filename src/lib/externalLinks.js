// One place that decides whether a link leaves AppBlips and, if so, asks first.
// `confirmExternal({ url, site, why }, action)` hands the request to the
// <ExternalLinkGuard> dialog; `action` runs on Continue and defaults to opening
// `url` in a new tab. Links clicked anywhere in the page are caught by the
// guard itself, so plain <a target="_blank"> links need no special treatment.

let listener = null;

export function setExternalListener(fn) {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}

export function openExternalNow(url) {
  try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* blocked */ }
}

export function confirmExternal(info, action) {
  if (listener) listener(info, action);
  else if (action) action();
  else openExternalNow(info.url);
}

// Only web pages on another origin count; mailto:, blob: and the app's own
// pages open without a prompt.
export function isExternalUrl(url) {
  try {
    const parsed = new URL(url, window.location.href);
    return /^https?:$/.test(parsed.protocol) && parsed.origin !== window.location.origin;
  } catch {
    return false;
  }
}

export function hostOf(url) {
  try { return new URL(url, window.location.href).hostname; } catch { return ''; }
}
