// Puter (https://puter.com) in the pages AppBlips builds: AI, a key-value
// database and file storage with no key at all. Puter.js uses a "user pays"
// model: each visitor signs in to their own Puter account in Puter's popup,
// and their account's free allowance pays. Their data is kept per app and per
// visitor. So, unlike Pollinations' site key, nothing that can spend money is
// ever written into a page.
//
// The AI writes ordinary Puter.js calls (puter.ai.chat, puter.kv.set, ...)
// and never the script tag. AppBlips adds what makes them run, never stored
// in `files`:
//  - exports and published sites get the real script, https://js.puter.com/v2/
//    (injectPuterScript). They run on their own origin, as Puter.js needs.
//  - the preview gets a stand-in `window.puter` (injectPuterShim). Puter.js
//    refuses to run on an opaque origin, and the preview frame has one on
//    purpose (no allow-same-origin). For now the preview uses it `offline`:
//    every call shows a notice, drawn in the page, asking the user to test on
//    the published site. Without `offline` it forwards each call over the
//    preview bridge to real Puter.js in AppBlips (puterHost.js), which isn't
//    wired up at the moment.
import { BRIDGE_CHANNEL, BRIDGE_PROTOCOL_VERSION } from '../previewBridge/protocol.js';

export const PUTER_SCRIPT_URL = 'https://js.puter.com/v2/';

// Calls the AI writes (see the Puter directive in prompts.js).
const USES_PUTER_RE = /\bputer\s*\.\s*(?:ai|kv|fs|auth)\s*\./;
export const usesPuter = (html) => typeof html === 'string' && USES_PUTER_RE.test(html);

// Any Puter.js script tag the page already has (the AI is told not to write
// one, but a pasted or older page may).
const PUTER_SCRIPT_TAG_RE = /<script\b[^>]*\bsrc\s*=\s*["']?https?:\/\/js\.puter\.com\/[^"'\s>]*["']?[^>]*>\s*<\/script\s*>/gi;
const hasPuterScript = (html) => new RegExp(PUTER_SCRIPT_TAG_RE.source, 'i').test(html);

const atHeadStart = (html, script) => {
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + script + html.slice(head.index + head[0].length);
  const doc = /<html\b[^>]*>/i.exec(html);
  if (doc) return html.slice(0, doc.index + doc[0].length) + script + html.slice(doc.index + doc[0].length);
  return script + html;
};

// Exports: the real Puter.js, first in <head> so the page's own scripts can
// use `puter` at once. Only for pages that call it, and only once.
export const injectPuterScript = (html) => {
  if (!usesPuter(html) || hasPuterScript(html)) return html;
  return atHeadStart(html, `<script src="${PUTER_SCRIPT_URL}"></script>`);
};

// The stand-in's source. Its own script, not part of the bridge IIFE, so it is
// given the bridge's token to address the parent. `offline` (the Open in new
// tab shell, which has no Puter host) makes every call fail with a message.
const shimSource = ({ token, signedIn, offline }) => `<script data-appblips-puter>
(function () {
var standIn = (function () {
  var CHANNEL = ${JSON.stringify(BRIDGE_CHANNEL)}, VERSION = ${BRIDGE_PROTOCOL_VERSION}, TOKEN = ${JSON.stringify(token)};
  var OFFLINE = ${offline ? 'true' : 'false'};
  var signedIn = ${signedIn && !offline ? 'true' : 'false'};
  var user = null;
  var seq = 0;
  var pending = {};
  function fail(code, message) { var err = new Error(message); err.code = code; return err; }
  window.addEventListener('message', function (e) {
    if (e.source !== parent) return;
    var d = e.data;
    if (!d || d.__orion !== CHANNEL || d.token !== TOKEN) return;
    var p = d.payload || {};
    var h = pending[p.id];
    if (!h) return;
    if (typeof p.signedIn === 'boolean') signedIn = p.signedIn;
    if (d.type === 'puter-chunk') { if (h.chunk) h.chunk(p.chunk); return; }
    if (d.type !== 'puter-result') return;
    delete pending[p.id];
    if (p.error) h.reject(fail(p.error.code, p.error.message));
    else h.resolve(p.value);
  });
  // Drops what can't cross postMessage (an AbortSignal, callbacks).
  function clean(args) {
    var out = [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (typeof a === 'function') continue;
      if (a && typeof a === 'object' && !Array.isArray(a) && !(a instanceof Blob) && !(a instanceof ArrayBuffer) && !ArrayBuffer.isView(a)) {
        var copy = {};
        for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k) && k !== 'signal' && typeof a[k] !== 'function') copy[k] = a[k];
        a = copy;
      }
      out.push(a);
    }
    return out;
  }
  // Offline: a notice drawn in the page itself (it works in the sandbox),
  // once at a time, and the call fails so the page shows its own error too.
  var LIVE_ONLY = 'Puter features only work on your published site. Publish your site and test them there.';
  var notice = null;
  function showLiveOnly() {
    if (notice || typeof document === 'undefined' || !document.body) return;
    notice = document.createElement('div');
    notice.setAttribute('role', 'dialog');
    notice.setAttribute('aria-modal', 'true');
    notice.setAttribute('aria-label', 'Test Puter on your published site');
    notice.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.55);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;';
    var card = document.createElement('div');
    card.style.cssText = 'max-width:360px;width:100%;background:#fff;color:#0f172a;border-radius:14px;padding:20px 20px 16px;box-shadow:0 20px 50px rgba(0,0,0,.3);text-align:left;';
    var title = document.createElement('div');
    title.textContent = 'Test this on your published site';
    title.style.cssText = 'font-weight:600;font-size:16px;margin:0 0 8px;';
    var text = document.createElement('p');
    text.textContent = LIVE_ONLY;
    text.style.cssText = 'margin:0 0 16px;color:#475569;';
    var ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = 'OK';
    ok.style.cssText = 'display:block;margin-left:auto;padding:8px 18px;border:0;border-radius:8px;background:#0f172a;color:#fff;font:inherit;font-weight:600;cursor:pointer;';
    ok.onclick = function () { if (notice) notice.remove(); notice = null; };
    card.appendChild(title);
    card.appendChild(text);
    card.appendChild(ok);
    notice.appendChild(card);
    document.body.appendChild(notice);
    try { ok.focus(); } catch (e) { /* not focusable yet */ }
  }
  function call(method, args, onChunk) {
    if (OFFLINE) {
      showLiveOnly();
      return Promise.reject(fail('preview', LIVE_ONLY));
    }
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject, chunk: onChunk };
      try {
        parent.postMessage({ __orion: CHANNEL, v: VERSION, token: TOKEN, type: 'puter-call', payload: { id: id, method: method, args: clean(args) } }, '*');
      } catch (err) {
        delete pending[id];
        reject(fail('invalid', 'Puter couldn\\u2019t send that: ' + ((err && err.message) || err)));
      }
    });
  }
  function method(name) { return function () { return call(name, Array.prototype.slice.call(arguments)); }; }
  // Like Puter's ChatResponse: message.content, and the reply as its text.
  function chatResponse(value) {
    var r = value && typeof value === 'object' ? value : { message: { content: String(value == null ? '' : value) } };
    var content = r.message && r.message.content;
    var text = typeof content === 'string' ? content
      : Array.isArray(content) ? content.map(function (c) { return (c && c.text) || ''; }).join('') : '';
    r.toString = function () { return text; };
    r.valueOf = function () { return text; };
    return r;
  }
  // A streamed chat: an async iterable of { type, text } parts.
  function chatStream(args) {
    var queue = [], waiters = [], done = false, error = null;
    function settle() {
      while (waiters.length && (queue.length || done || error)) {
        var w = waiters.shift();
        if (queue.length) w.resolve({ value: queue.shift(), done: false });
        else if (error) w.reject(error);
        else w.resolve({ value: undefined, done: true });
      }
    }
    call('ai.chat', args, function (chunk) { if (!done) { queue.push(chunk); settle(); } })
      .then(function () { done = true; settle(); }, function (err) { error = err; settle(); });
    var iterator = {
      next: function () { return new Promise(function (resolve, reject) { waiters.push({ resolve: resolve, reject: reject }); settle(); }); },
      return: function () { done = true; queue = []; settle(); return Promise.resolve({ value: undefined, done: true }); }
    };
    iterator[Symbol.asyncIterator] = function () { return iterator; };
    return Promise.resolve(iterator);
  }
  function wantsStream(args) {
    for (var i = 1; i < args.length; i++) if (args[i] && typeof args[i] === 'object' && args[i].stream === true) return true;
    return false;
  }
  // AppBlips sends a Blob for media made in its own page (a blob: URL there
  // can't load in here) or a URL as text.
  function mediaSrc(value) {
    if (value && typeof value === 'object' && value instanceof Blob) return URL.createObjectURL(value);
    return String((value && value.src) || value || '');
  }
  // Methods the stand-in doesn't have still reach AppBlips, which answers
  // with a clear "isn't available in the preview" error (and logs it),
  // instead of a TypeError the page's own catch would hide.
  function withFallback(obj, prefix) {
    if (typeof Proxy !== 'function') return obj;
    return new Proxy(obj, {
      get: function (target, key) {
        if (key in target || typeof key !== 'string' || key === 'then' || key === 'toJSON' || key.charAt(0) === '_') return target[key];
        return prefix ? method(prefix + key) : withFallback({}, key + '.');
      }
    });
  }
  var api = {
    ai: {
      chat: function () {
        var args = Array.prototype.slice.call(arguments);
        if (wantsStream(args)) return chatStream(args);
        return call('ai.chat', args).then(chatResponse);
      },
      txt2img: function () {
        return call('ai.txt2img', Array.prototype.slice.call(arguments)).then(function (v) {
          var img = new Image();
          img.src = mediaSrc(v);
          return img;
        });
      },
      txt2speech: function () {
        return call('ai.txt2speech', Array.prototype.slice.call(arguments)).then(function (v) { return new Audio(mediaSrc(v)); });
      },
      img2txt: method('ai.img2txt')
    },
    kv: {
      set: method('kv.set'), get: method('kv.get'), del: method('kv.del'),
      incr: method('kv.incr'), decr: method('kv.decr'), list: method('kv.list')
    },
    fs: {
      write: method('fs.write'), read: method('fs.read'), readdir: method('fs.readdir'),
      mkdir: method('fs.mkdir'), delete: method('fs.delete'), getReadURL: method('fs.getReadURL')
    },
    auth: {
      isSignedIn: function () { return signedIn; },
      signIn: function () {
        return call('auth.signIn', []).then(function (v) { signedIn = true; return v; });
      },
      getUser: function () {
        if (user) return Promise.resolve(user);
        return call('auth.getUser', []).then(function (v) { user = v; return v; });
      },
      // The preview always uses the builder's account: signing out is done in
      // AppBlips' Settings, never by a page.
      signOut: function () { return Promise.resolve(); }
    },
    print: function () {
      var text = Array.prototype.slice.call(arguments).map(String).join(' ');
      var add = function () { document.body.appendChild(document.createTextNode(text)); };
      if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
    }
  };
  for (var ns in api) if (api[ns] && typeof api[ns] === 'object') api[ns] = withFallback(api[ns], ns + '.');
  return withFallback(api, '');
})();
// Locked, so the page can't swap it for the real Puter.js (which can't run
// on this frame's opaque origin and would fail without a word). Assigning to
// it is quietly ignored rather than throwing, so a page or a Puter.js the
// page loads itself doesn't crash on it.
try {
  Object.defineProperty(window, 'puter', { get: function () { return standIn; }, set: function () {}, configurable: false, enumerable: true });
} catch (e) {
  window.puter = standIn;
}
})();
</script>`;

// Preview: the stand-in first in <head>, and any real Puter.js tag removed
// (on the frame's opaque origin it would only show Puter's "Unsupported
// origin" dialog and replace the stand-in). Only for pages that call Puter.
// `token` is the preview bridge's; `signedIn` seeds puter.auth.isSignedIn(),
// which is synchronous.
export const injectPuterShim = (html, { token = '', signedIn = false, offline = false } = {}) => {
  if (!usesPuter(html)) return html;
  return atHeadStart(html.replace(PUTER_SCRIPT_TAG_RE, ''), shimSource({ token, signedIn, offline }));
};
