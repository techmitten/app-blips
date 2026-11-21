import { injectLoopProtection } from './lib/loopProtection.js';
import { compileJsxScripts } from './lib/jsxCompile.js';
import { injectPollinationsHelper } from './lib/pollinationsHelper.js';
import { injectSheetsHelper } from './lib/sheetsHelper.js';
import { sourceFingerprint, stampSourcePositions } from './lib/sourcePositions.js';
import { rewriteGalleryRefs } from './lib/galleryImages.js';
import { BRIDGE_SOURCE } from './previewBridge/index.js';

/**
 * Preview bridge.
 *
 * The generated app runs in an origin-isolated iframe (`sandbox` without
 * `allow-same-origin`), so the parent can no longer reach into
 * `iframe.contentDocument`. Everything the parent used to do by touching the
 * frame's DOM now lives inside the frame, injected as a single inline script,
 * and is driven over `postMessage`.
 *
 * The script does several jobs:
 *
 *  1. Shims `localStorage` / `sessionStorage` / `document.cookie`. On an opaque
 *     origin these THROW `SecurityError` on mere access, which would kill the
 *     generated app's inline script at that line and leave a white screen.
 *     Generated apps hit this constantly -- the suggested prompts in the UI are
 *     "habit tracker", "to-do list", "budget tracker".
 *  2. Runs the mobile touch-scroll simulation (drag, momentum, click
 *     suppression) that used to live in an effect in App.jsx.
 *  3. On request, serializes the document (cloned markup + collected
 *     stylesheet text) for the screenshot-attachment feature. It deliberately
 *     does NOT rasterize to a canvas itself: nested `<iframe>`s created by
 *     script running inside this already-sandboxed-without-allow-same-origin
 *     frame are FORCIBLY sandboxed too (HTML's sandboxing propagates to any
 *     browsing context a sandboxed document creates, precisely so sandboxing
 *     can't be escaped by nesting another frame) and each gets a fresh,
 *     distinct opaque origin -- so any library that clones into a helper
 *     iframe to compute styles (html2canvas, dom-to-image, ...) throws
 *     "Blocked a frame with origin 'null' from accessing a cross-origin
 *     frame" the moment it reads that helper iframe's `.document`, no matter
 *     how it's created. This frame only has to reach that far; rasterizing
 *     the snapshot into a canvas happens in the PARENT window instead (see
 *     rasterizeDomSnapshot in src/lib/attachments.js), which is never
 *     sandboxed and hits none of this.
 *  4. Website-studio visual editing: hover/click element picking that
 *     reports a serialized description of the selected element to the
 *     parent over the same token-authenticated channel (message plumbing).
 *     Text-bearing elements go straight into IN-PLACE editing instead:
 *     the element becomes contentEditable, the user types on the page,
 *     and the committed text is sent back for a deterministic source
 *     edit. The parent owns the actual editing UI and applies changes to
 *     the source; this side outlines, reports and hosts the typing.
 *
 * IMPORTANT: the bridge is spliced in at RENDER time only (see the `useMemo`
 * feeding the iframe's `srcDoc` in App.jsx) and is never written into
 * `generatedCode`. That keeps it out of downloads, the clipboard, the code
 * pane, and `orion-projects` -- and, most importantly, out of the reach of
 * `applySurgicalEdits`, whose fuzzy line-scan would otherwise happily match
 * inside bridge code and corrupt it on refinement.
 *
 * The in-frame script's source is split by topic across src/previewBridge/
 * (joined in order by src/previewBridge/index.js). This file keeps what runs
 * in the parent: the per-render injection and the message helpers.
 */

export { BRIDGE_CHANNEL, BRIDGE_PROTOCOL_VERSION, youTubeWatchUrl, externalLinkUrl } from './previewBridge/protocol.js';

const makeToken = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return 'tok-' + Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(36)).join('');
};


// A stray "</" inside the source would silently truncate the injected <script>
// tag and leave the rest of the bridge as visible page text. Fail loudly at
// module load instead of debugging it in a generated app.
if (BRIDGE_SOURCE.indexOf('</') !== -1) {
  throw new Error('previewBridge: BRIDGE_SOURCE contains "</", which would truncate the injected script tag.');
}

export const PREVIEW_BRIDGE_SCRIPT = BRIDGE_SOURCE;

// The data-orion-bridge marker lets captureDomSnapshot strip this tag out of
// the cloned document before sending its HTML back to the parent.
const SCRIPT_OPEN = '<script data-orion-bridge="true">';
// Assembled so this module's own source never contains the literal sequence.
const SCRIPT_CLOSE = '</' + 'script>';

const buildTag = (token, initialStorage, touchEnabled, projectMode, sourceFp) => {
  const safeData = JSON.stringify(
    initialStorage && typeof initialStorage === 'object' ? initialStorage : {}
  ).replace(/</g, '\\u003c');

  // One pass with a function replacer: a saved storage value is user data
  // and may hold "$'" or "$$", which String.replace with a string
  // replacement would expand (copying bridge source into the script, or
  // eating a dollar sign on every reload), or the name of a later
  // placeholder, which a chain of replaces would then fill in.
  const values = {
    __ORION_TOKEN__: token,
    __ORION_INITIAL_STORAGE__: safeData,
    __ORION_INITIAL_TOUCH_ENABLED__: touchEnabled ? 'true' : 'false',
    __ORION_PROJECT_MODE__: projectMode ? 'true' : 'false',
    __ORION_SOURCE_FP__: sourceFp ? JSON.stringify(sourceFp) : 'null',
  };
  const source = BRIDGE_SOURCE.replace(/__ORION_(?:TOKEN|INITIAL_STORAGE|INITIAL_TOUCH_ENABLED|PROJECT_MODE|SOURCE_FP)__/g, (name) => values[name]);

  if (source.indexOf('</') !== -1) {
    throw new Error('previewBridge: Injected script contains "</", which would truncate the injected script tag.');
  }

  return SCRIPT_OPEN + source + SCRIPT_CLOSE;
};

/**
 * Splice the bridge into a generated document.
 *
 * Index-based insertion at a single point, never a global replace, so every
 * byte of model output outside the insertion point is preserved verbatim.
 * The bridge must land as early as possible -- before the Tailwind CDN tag and
 * before the app's own script -- so the storage shim is in place by the time
 * anything touches `localStorage`.
 *
 * @param {string} code
 * @param {{ initialStorage?: Record<string, string>, touchEnabled?: boolean, projectMode?: boolean,
 *   sourcePositions?: boolean, pollinations?: { siteKey: string, visitors: boolean },
 *   gallery?: { images: Array<{ name: string, hash: string }>, toUrl: (image: object) => string } }} [options]
 *   `touchEnabled` bakes the parent's current device mode (mobile/tablet vs
 *   desktop -- PREVIEW_MODES[previewMode].isTouchChrome) in as the bridge's
 *   initial state, so the touch-scroll simulation and scrollbar hiding are
 *   active from the frame's first paint without waiting for a configure
 *   message that can lose the load race on srcdoc documents.
 *   `projectMode` is for imported codebases: relative links are left to the
 *   app's router and route changes are posted as 'route-changed'.
 *   `sourcePositions` numbers the page's tags for click-to-edit
 *   (lib/sourcePositions.js); preview only, like everything injected here.
 *   `pollinations` says how the Pollinations helper pays for AI features
 *   (lib/pollinationsHelper.js, getPollinationsHelperOptions in connectors.js).
 *   `sheets` is the Google Sheets web app URL the SheetDB helper calls
 *   (lib/sheetsHelper.js, getSheetsScriptUrl in connectors.js).
 *   `gallery` turns images/<name> paths of the user's uploaded images into
 *   URLs the opaque-origin frame can load (lib/galleryImages.js).
 * @returns {{ srcDoc: string, token: string }}
 */
export const injectPreviewBridge = (code, options = {}) => {
  const token = makeToken();

  if (typeof code !== 'string' || !code) {
    return { srcDoc: '', token };
  }

  // Numbered against the stored source, before anything else rewrites it.
  const sourceFp = options?.sourcePositions === true ? sourceFingerprint(code) : null;
  if (sourceFp) code = stampSourcePositions(code);
  // A srcdoc frame has no base URL for relative paths, so uploaded images
  // are pointed at their stored copies here, in the preview copy only.
  if (options?.gallery) code = rewriteGalleryRefs(code, options.gallery.images, options.gallery.toUrl);
  // The Pollinations helper is AppBlips' own code, so it goes in after loop
  // protection, which only guards the app's loops. The bridge tag below lands
  // ahead of it, so the storage shim is ready when it reads sessionStorage.
  code = injectSheetsHelper(injectPollinationsHelper(injectLoopProtection(compileJsxScripts(code)), options?.pollinations), options?.sheets);

  const initialStorage = options?.initialStorage;
  const tag = buildTag(token, initialStorage, options?.touchEnabled === true, options?.projectMode === true, sourceFp);
  const insertAt = (index, payload) => code.slice(0, index) + payload + code.slice(index);

  // A leading <!DOCTYPE html> needs no special case -- it falls out of this
  // naturally, since we insert after <head>/<html>/<body> rather than at 0.
  const headMatch = /<head\b[^>]*>/i.exec(code);
  if (headMatch) {
    return { srcDoc: insertAt(headMatch.index + headMatch[0].length, tag), token };
  }

  const htmlMatch = /<html\b[^>]*>/i.exec(code);
  if (htmlMatch) {
    const head = '<head>' + tag + '</' + 'head>';
    return { srcDoc: insertAt(htmlMatch.index + htmlMatch[0].length, head), token };
  }

  const bodyMatch = /<body\b[^>]*>/i.exec(code);
  if (bodyMatch) {
    return { srcDoc: insertAt(bodyMatch.index + bodyMatch[0].length, tag), token };
  }

  return { srcDoc: tag + code, token };
};
