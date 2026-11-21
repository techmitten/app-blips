// Preview bridge source, part 2 of 17. Section 1: the localStorage / sessionStorage / document.cookie shims.
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
export default `  // ------------------------------------------------------------------
  // 1. Storage shim
  //
  // The probe is what makes this a no-op if origin isolation is ever
  // relaxed: if the real API works, we leave it completely alone.
  // In preview, localStorage is hydrated from the parent's persisted
  // snapshot and mutations are synchronized back over postMessage.
  // ------------------------------------------------------------------

  var INITIAL_STORAGE = __ORION_INITIAL_STORAGE__;

  function memStorage(initialData, isPersistent) {
    var m = Object.create(null);
    if (initialData && typeof initialData === 'object') {
      for (var k in initialData) {
        if (Object.prototype.hasOwnProperty.call(initialData, k)) {
          m[String(k)] = String(initialData[k]);
        }
      }
    }
    var api = {
      getItem: function (k) {
        k = String(k);
        return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null;
      },
      setItem: function (k, v) {
        var sk = String(k);
        var sv = String(v);
        m[sk] = sv;
        if (isPersistent) {
          post('storage_set', { key: sk, value: sv });
        }
      },
      removeItem: function (k) {
        var sk = String(k);
        delete m[sk];
        if (isPersistent) {
          post('storage_remove', { key: sk });
        }
      },
      clear: function () {
        m = Object.create(null);
        if (isPersistent) {
          post('storage_clear', {});
        }
      },
      key: function (i) {
        var ks = Object.keys(m);
        i = Number(i);
        return i >= 0 && i < ks.length ? ks[i] : null;
      }
    };
    Object.defineProperty(api, 'length', {
      get: function () { return Object.keys(m).length; }
    });
    if (isPersistent) {
      // The Umami and Plausible connectors put analytics in generated pages.
      // Their trackers skip sending when these "exclude my visits" flags are
      // set, so previews and the AI's test runs don't count as visits. Kept
      // out of m so they survive clear(), never sync to the parent, and
      // never appear in keys or length. Exports have no bridge and count
      // normally. Plausible reads its flag as a property, Umami via getItem.
      var getStored = api.getItem;
      api.getItem = function (k) {
        return String(k) === 'umami.disabled' ? '1' : getStored(k);
      };
      Object.defineProperty(api, 'plausible_ignore', { value: 'true' });
    }
    return api;
  }

  function shimStorage(name, initialData, isPersistent) {
    try {
      // Touching .length is enough to trip the SecurityError.
      void window[name].length;
      return;
    } catch (probeErr) { /* opaque origin -- fall through and shim */ }
    var store = memStorage(initialData, isPersistent);
    try {
      Object.defineProperty(window, name, { value: store, configurable: true, writable: false });
      return;
    } catch (ownErr) { /* try the prototype instead */ }
    try {
      Object.defineProperty(Window.prototype, name, { value: store, configurable: true });
    } catch (protoErr) { /* nothing more we can do */ }
  }

  function shimCookie() {
    try {
      void document.cookie;
      return;
    } catch (probeErr) { /* opaque origin -- fall through and shim */ }
    var jar = '';
    var desc = {
      configurable: true,
      get: function () { return jar; },
      set: function (v) {
        var pair = String(v).split(';')[0];
        if (!pair) return jar;
        jar = jar ? jar + '; ' + pair : pair;
        return v;
      }
    };
    try {
      Object.defineProperty(document, 'cookie', desc);
      return;
    } catch (ownErr) { /* try the prototype instead */ }
    try {
      Object.defineProperty(Document.prototype, 'cookie', desc);
    } catch (protoErr) { /* nothing more we can do */ }
  }

  shimStorage('localStorage', INITIAL_STORAGE, true);
  shimStorage('sessionStorage', null, false);
  shimCookie();

`;
