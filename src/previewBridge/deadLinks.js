// Preview bridge source, part 12 of 17. Dead-link and form-submit guard for the srcdoc frame.
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
export default `  // Dead-link guard. The frame's document is about:srcdoc, so a relative
  // href ("about.html", "/pricing", "") would navigate the frame to a blank
  // page with nothing to go back to. Only links that lead somewhere real are
  // followed: in-page hashes, mailto/tel, and absolute web URLs (forced into
  // a new tab so they can never replace the preview). Everything else is
  // swallowed.
  // Root cause of the blank frame: relative URLs (including "#section") in a
  // srcdoc document resolve against the parent page's URL, so following one is
  // a cross-document navigation to the app's own origin, which refuses to be
  // framed. Pin the base to about:srcdoc so "#x" stays a same-document jump
  // and "page.html" fails to resolve (a no-op) instead of navigating.
  try {
    if (!document.querySelector('base[href]')) {
      var pinBase = document.createElement('base');
      pinBase.setAttribute('href', 'about:srcdoc');
      pinBase.setAttribute('data-orion-bridge', 'true');
      (document.head || document.documentElement).insertBefore(pinBase, (document.head || document.documentElement).firstChild);
    }
  } catch (err) { /* keep going without the pin */ }

  function onLinkClick(e) {
    if (e.defaultPrevented || editingActive) return;
    var t = e.target;
    var a = t && t.closest ? t.closest('a[href], area[href], button[href], [role="button"][href]') : null;
    if (!a) return;
    var raw = (a.getAttribute('href') || '').trim();
    if (!raw || /^javascript:/i.test(raw)) return;
    if (raw.charAt(0) === '#') {
      if (a.tagName !== 'A' && a.tagName !== 'AREA') {
        var hashId = raw.slice(1);
        var hashEl = hashId ? document.getElementById(hashId) : null;
        if (hashEl && hashEl.scrollIntoView) {
          e.preventDefault();
          hashEl.scrollIntoView();
        }
      }
      return;
    }
    if (/^(mailto|tel|sms):/i.test(raw)) return;
    if (/^https?:[/][/]/i.test(raw) || /^[/][/][^/]/.test(raw)) {
      var yt = youTubeTarget(/^[/][/]/.test(raw) ? 'https:' + raw : raw);
      if (yt) {
        // Opened by the parent: see youTubeTarget.
        e.preventDefault();
        post('open-youtube', yt);
        return;
      }
      // Opened by the parent, like YouTube: a tab opened from this frame
      // inherits its sandbox, and sites that send a strict
      // Cross-Origin-Opener-Policy (Google Maps, YouTube, many sign-in pages)
      // refuse to load there ("blocked").
      e.preventDefault();
      post('open-link', { url: /^[/][/]/.test(raw) ? 'https:' + raw : new URL(raw, document.baseURI).href });
      return;
    }
    // In an imported codebase a relative link is a client-side route: let it
    // reach the app's router (react-router's <Link> handles it and calls
    // preventDefault); onUnhandledRouteClick catches plain <a href="/x">.
    if (PROJECT_MODE && (a.tagName === 'A' || a.tagName === 'AREA')) return;
    e.preventDefault();
    if (PROJECT_MODE && typeof window.__appblipsRouterNavigate === 'function') {
      try { window.__appblipsRouterNavigate(raw); } catch (err) { /* router rejected it */ }
      return;
    }
    // A relative link may be an internal page ("about.html", "/pricing").
    // The parent owns the page set and swaps the document itself; it ignores
    // anything that is not one of the project's pages.
    if (!a.hasAttribute('download') && !/^[a-z][a-z0-9+.-]*:/i.test(raw) && raw !== '') {
      post('navigate-page', { href: raw });
    }
  }
  document.addEventListener('click', onLinkClick, true);
  // Bubble phase, after the app's own handlers: a relative link nobody
  // handled would navigate the frame away, so cancel it and hand it to the
  // router shim (codebase/routerShim.js) when there is one.
  function onUnhandledRouteClick(e) {
    if (e.defaultPrevented || editingActive) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href], area[href]') : null;
    if (!a) return;
    var raw = (a.getAttribute('href') || '').trim();
    if (!raw || raw.charAt(0) === '#' || /^[a-z][a-z0-9+.-]*:/i.test(raw) || /^[/][/]/.test(raw)) return;
    e.preventDefault();
    if (typeof window.__appblipsRouterNavigate === 'function') {
      try { window.__appblipsRouterNavigate(raw); } catch (err) { /* router rejected it */ }
    }
  }
  if (PROJECT_MODE) {
    window.addEventListener('click', onUnhandledRouteClick);
    window.__appblipsReportRoute = function (path) {
      post('route-changed', { path: String(path || '/').slice(0, 2000) });
    };
  }
  // A form with no real destination would navigate the frame to a blank page.
  // Cancel the native submit; the app's own submit handlers still run.
  document.addEventListener('submit', function (e) {
    if (editingActive || e.defaultPrevented) return;
    var f = e.target;
    var action = f && f.getAttribute ? (f.getAttribute('action') || '').trim() : '';
    if (!/^https?:[/][/]/i.test(action)) e.preventDefault();
  }, true);

  // Catch-all for navigations the click handler can't see: middle/ctrl-click
  // (auxclick), form submits, and script-driven location changes. A srcdoc
  // frame resolves relative URLs against the parent page, so a dead link
  // lands on the app's own origin, which refuses to be framed ("localhost
  // refused to connect"). Cancel those; hand real external URLs to a new tab.
  function baseOrigin() {
    try { return new URL(document.baseURI).origin; } catch (err) { return null; }
  }
  function isDeadTarget(url) {
    try {
      var u = new URL(url, document.baseURI);
      if (u.protocol === 'mailto:' || u.protocol === 'tel:' || u.protocol === 'sms:') return false;
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
      return u.origin === baseOrigin();
    } catch (err) { return true; }
  }
  document.addEventListener('auxclick', function (e) {
    if (editingActive) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href], area[href]') : null;
    if (a && isDeadTarget(a.getAttribute('href') || '') && (a.getAttribute('href') || '').trim().charAt(0) !== '#') {
      e.preventDefault();
    }
  }, true);
  try {
    if (window.navigation && typeof window.navigation.addEventListener === 'function') {
      window.navigation.addEventListener('navigate', function (e) {
        if (!e.cancelable || e.hashChange || e.navigationType === 'reload' || e.navigationType === 'traverse') return;
        if (e.destination && e.destination.sameDocument) return;
        var dest = e.destination && e.destination.url;
        if (!dest || /^(mailto|tel|sms):/i.test(dest)) return;
        e.preventDefault();
        var ytNav = youTubeTarget(dest);
        if (ytNav) post('open-youtube', ytNav);
        else if (!isDeadTarget(dest)) post('open-link', { url: dest });
      });
    }
  } catch (err) { /* Navigation API unavailable */ }
  var nativeOpen = window.open;
  if (typeof nativeOpen === 'function') {
    window.open = function (url) {
      if (url !== undefined && url !== null && String(url) !== '' && isDeadTarget(String(url))) return null;
      var ytOpen = url ? youTubeTarget(url) : null;
      if (ytOpen) { post('open-youtube', ytOpen); return null; }
      // A web address opens through the parent (see the click handler).
      try {
        var web = url ? new URL(String(url), document.baseURI) : null;
        if (web && (web.protocol === 'https:' || web.protocol === 'http:')) { post('open-link', { url: web.href }); return null; }
      } catch (err) { /* not a URL: left to the browser */ }
      return nativeOpen.apply(window, arguments);
    };
  }

`;
