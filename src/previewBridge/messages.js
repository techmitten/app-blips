// Preview bridge source, part 15 of 17. Section 4: message plumbing with the parent.
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
export default `  // ------------------------------------------------------------------
  // 4. Message plumbing
  // ------------------------------------------------------------------

  var domReady = false;
  // Seeded at injection time from the parent's current device mode (see the
  // touchEnabled option of injectPreviewBridge) so the simulation -- and the
  // scrollbar-hiding CSS that ships with it -- is active from first paint. A
  // configure message from the parent cannot be relied on for this: a srcdoc
  // document can finish loading BEFORE the parent's post-load effect
  // listeners re-attach (the heavy commit when a generation completes is
  // exactly that race), which would otherwise leave the frame unconfigured
  // until a manual reload. Later pushes still toggle this at runtime.
  var desiredEnabled = __ORION_INITIAL_TOUCH_ENABLED__;
  var teardownFn = null;

  function sync() {
    if (!domReady) return;
    try {
      if (desiredEnabled && !teardownFn) {
        teardownFn = install();
      } else if (!desiredEnabled && teardownFn) {
        teardownFn();
        teardownFn = null;
      }
    } catch (err) {
      post('error', { message: String((err && err.message) || err) });
    }
  }

  // Registered synchronously, before the DOM exists, so no parent message can
  // be missed while the document is still parsing.
  window.addEventListener('message', function (e) {
    if (e.source !== parent) return;
    var d = e.data;
    if (!d || d.__orion !== CHANNEL || d.token !== TOKEN) return;
    if (d.type === 'configure') {
      desiredEnabled = !!(d.payload && d.payload.enabled);
      sync();
    } else if (d.type === 'set-muted') {
      setBuildMuted(!!(d.payload && d.payload.muted));
    } else if (d.type === 'set-editing') {
      setEditingEnabled(
        !!(d.payload && d.payload.enabled),
        !!(d.payload && d.payload.drag),
        !!(d.payload && d.payload.containerLock)
      );
    } else if (d.type === 'nav-back' || d.type === 'nav-forward') {
      var goBack = d.type === 'nav-back';
      try {
        var nv = window.navigation;
        var p = nv ? (goBack ? nv.back() : nv.forward()) : (goBack ? history.back() : history.forward());
        if (p && p.committed && p.finished) { p.committed.catch(function () {}); p.finished.catch(function () {}); }
      } catch (err) { /* nothing to traverse */ }
    } else if (d.type === 'scroll-to-hash') {
      try {
        var hid = String((d.payload && d.payload.hash) || '');
        var hel = hid ? document.getElementById(hid) : null;
        if (hel && hel.scrollIntoView) hel.scrollIntoView();
      } catch (err) { /* no such anchor */ }
    } else if (d.type === 'select-parent') {
      editSelectParent(d.payload && d.payload.steps);
    } else if (d.type === 'select-child') {
      editSelectChild(d.payload && d.payload.steps);
    } else if (d.type === 'start-inline-edit') {
      editStartSelectedInline();
    } else if (d.type === 'deselect') {
      clearSelection(false);
    } else if (d.type === 'insert-clear') {
      clearInsertSpot();
    } else if (d.type === 'inline-format') {
      applyInlineFormat(d.payload && d.payload.styles, d.payload && d.payload.fontGoogle);
    } else if (d.type === 'inline-undo' || d.type === 'inline-redo') {
      stepInlineHistory(d.type === 'inline-redo' ? 1 : -1);
    } else if (d.type === 'inline-hold') {
      inlineHold = !!(d.payload && d.payload.hold);
      if (inlineHold && inlineEdit && inlineEdit.blurTimer) { clearTimeout(inlineEdit.blurTimer); inlineEdit.blurTimer = null; }
    } else if (d.type === 'inline-finish') {
      finishInlineEdit(!!(d.payload && d.payload.commit), false);
    } else if (d.type === 'inline-edit-result') {
      resolveInlineEdit(!!(d.payload && d.payload.ok), d.payload ? d.payload.editId : null, d.payload ? d.payload.sourceSync : null);
    } else if (d.type === 'image-resize-result') {
      resolveImageResize(!!(d.payload && d.payload.ok), d.payload ? d.payload.editId : null, d.payload ? d.payload.sourceSync : null);
    } else if (d.type === 'apply-image-size') {
      applyImageSizeInFrame(d.payload && d.payload.size);
    } else if (d.type === 'restore-scroll') {
      try {
        window.scrollTo((d.payload && d.payload.x) || 0, (d.payload && d.payload.y) || 0);
      } catch (scrollErr) { /* nothing to restore */ }
    } else if (d.type === "capture-screenshot") {
      captureDomSnapshot(d.payload && d.payload.requestId);
    }
  });

  // Back/forward availability for the desktop browser chrome. Only the
  // Navigation API can answer this (history.length is not directional), so
  // without it both buttons simply stay disabled.
  function postNavState() {
    var nv = window.navigation;
    post('nav-state', { canGoBack: !!(nv && nv.canGoBack), canGoForward: !!(nv && nv.canGoForward) });
  }
  try {
    if (window.navigation && typeof window.navigation.addEventListener === 'function') {
      window.navigation.addEventListener('currententrychange', postNavState);
    }
  } catch (err) { /* Navigation API unavailable */ }

  function onReady() {
    domReady = true;
    sync();
    post('ready');
    postNavState();
  }

      if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }

`;
