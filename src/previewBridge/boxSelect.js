// Preview bridge source, part 8 of 17. Box select and Shift+click multi-selection.
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
export default `  // --- Box select ----------------------------------------------------------
  // Outside drag mode (where pressing and dragging moves an element), pressing
  // on the page and dragging draws a selection box. Every element that ends up
  // wholly inside it is selected, outermost only: boxing three cards picks the
  // cards, not the headings inside them. Shift+drag adds to the selection, as
  // Shift+click does one element at a time. With the touch simulation on
  // (phone and tablet previews) a plain mouse drag scrolls the page, so the box
  // needs Shift there. Like every other gesture this side only reports: one
  // element goes out as element-selected, several as elements-selected.

  var GROUP_MAX = 40;
  var MARQUEE_SCAN_MAX = 6000;
  var MARQUEE_SLACK = 2;
  var MARQUEE_CSS = '* { -webkit-user-select: none !important; user-select: none !important; }';
  var MARQUEE_SKIP_TAGS = { HTML: 1, HEAD: 1, BODY: 1, SCRIPT: 1, STYLE: 1, TEMPLATE: 1, LINK: 1, META: 1, NOSCRIPT: 1, BR: 1, WBR: 1 };
  var marquee = null;

  function currentPicked() {
    return editSelectedEl ? [editSelectedEl] : editGroupEls.slice();
  }

  // Newest wins: an element never shares the selection with its own
  // ancestor or descendant (a group delete would remove it twice).
  function addPicked(list, extra) {
    var out = list.slice();
    for (var i = 0; i < extra.length; i++) {
      var el = extra[i];
      out = out.filter(function (o) { return o !== el && !o.contains(el) && !el.contains(o); });
      out.push(el);
    }
    return out;
  }

  function paintPicked(list) {
    if (list.length === 1) {
      editSelectedEl = list[0];
      paintSelection(list[0]);
    } else {
      editGroupEls = list;
      for (var i = 0; i < list.length; i++) paintSelection(list[i]);
    }
  }

  function selectElements(list) {
    clearHover();
    if (editSelectedEl) restoreOutline(editSelectedEl);
    editSelectedEl = null;
    clearGroup();
    if (!list.length) {
      post('element-deselected', {});
      return;
    }
    list = list.slice().sort(function (a, b) {
      return a.compareDocumentPosition(b) & 4 ? -1 : 1;
    });
    var truncated = list.length > GROUP_MAX;
    if (truncated) list = list.slice(0, GROUP_MAX);
    paintPicked(list);
    syncResizeOverlay();
    if (list.length === 1) {
      describeElement(list[0]);
      return;
    }
    var descriptions = [];
    for (var i = 0; i < list.length; i++) descriptions.push(buildElementDescription(list[i]));
    post('elements-selected', { elements: descriptions, truncated: truncated });
  }

  function toggleInSelection(el) {
    var list = currentPicked();
    var at = list.indexOf(el);
    if (at !== -1) list.splice(at, 1);
    else list = addPicked(list, [el]);
    selectElements(list);
  }

  // The box in viewport coordinates. Its start is kept in page coordinates
  // so it stays pinned to the content while the page scrolls under it.
  function marqueeRect(m) {
    var sx = window.pageXOffset || 0;
    var sy = window.pageYOffset || 0;
    var x0 = m.startPageX - sx;
    var y0 = m.startPageY - sy;
    return { left: Math.min(x0, m.x), top: Math.min(y0, m.y), right: Math.max(x0, m.x), bottom: Math.max(y0, m.y) };
  }

  // Outermost visible elements wholly inside the box. An SVG counts as one
  // picture, never as its inner shapes.
  function elementsInBox(box) {
    if (!document.body) return [];
    var all;
    try { all = document.body.getElementsByTagName('*'); } catch (qErr) { return []; }
    var inside = [];
    var limit = Math.min(all.length, MARQUEE_SCAN_MAX);
    for (var i = 0; i < limit; i++) {
      var el = all[i];
      if (MARQUEE_SKIP_TAGS[upperTag(el)] || el.ownerSVGElement || isBridgeNode(el)) continue;
      var r;
      try { r = el.getBoundingClientRect(); } catch (rErr) { continue; }
      if (r.width < 1 || r.height < 1) continue;
      if (r.left < box.left - MARQUEE_SLACK || r.top < box.top - MARQUEE_SLACK ||
          r.right > box.right + MARQUEE_SLACK || r.bottom > box.bottom + MARQUEE_SLACK) continue;
      try { if (window.getComputedStyle(el).visibility === 'hidden') continue; } catch (vErr) { /* count it */ }
      inside.push(el);
    }
    for (var a = 0; a < inside.length; a++) inside[a].__orionBoxed = true;
    var outer = [];
    for (var k = 0; k < inside.length; k++) {
      var covered = false;
      for (var p = inside[k].parentElement; p && p !== document.body; p = p.parentElement) {
        if (p.__orionBoxed) { covered = true; break; }
      }
      if (!covered) outer.push(inside[k]);
    }
    for (var c = 0; c < inside.length; c++) inside[c].__orionBoxed = null;
    return outer;
  }

  // Live preview: what a release now would select wears the hover outline.
  function paintMarqueeHits(m, hits) {
    for (var i = 0; i < m.hits.length; i++) {
      if (hits.indexOf(m.hits[i]) === -1 && !isPicked(m.hits[i])) restoreOutline(m.hits[i]);
    }
    for (var j = 0; j < hits.length; j++) paintHover(hits[j]);
    m.hits = hits;
  }

  // One update per frame, like dragFrame. Holding the pointer past the top
  // or bottom edge (in the direction it is dragging) scrolls the page, so a
  // box can reach past the fold.
  function marqueeFrame() {
    var m = marquee;
    if (!m || !m.active) return;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var step = 0;
    if (m.y < DRAG_EDGE && m.y < m.startY) step = -Math.ceil((DRAG_EDGE - m.y) / 3);
    else if (m.y > vh - DRAG_EDGE && m.y > m.startY) step = Math.ceil((m.y - (vh - DRAG_EDGE)) / 3);
    if (step) {
      try { scrollInstant(document.scrollingElement || document.documentElement, step); } catch (scrollErr) { /* nothing to scroll */ }
      m.moved = true;
    }
    if (m.moved) {
      m.moved = false;
      var box = marqueeRect(m);
      placeBox(m.node, box.left, box.top, box.right - box.left, box.bottom - box.top);
      paintMarqueeHits(m, elementsInBox(box));
    }
    m.raf = requestAnimationFrame(marqueeFrame);
  }

  function startMarquee() {
    var m = marquee;
    m.active = true;
    clearHover();
    try {
      var sel = window.getSelection();
      if (sel) sel.removeAllRanges();
    } catch (selErr) { /* nothing selected */ }
    try { document.documentElement.setPointerCapture(m.pointerId); } catch (capErr) { /* events still arrive while pressed */ }
    if (editStyleEl) editStyleEl.textContent = editCursorCss() + MARQUEE_CSS;
    // A fresh box replaces the selection; the parent hears about it on
    // release (a cancel paints the old one back without a message).
    m.base = currentPicked();
    if (!m.additive) {
      if (editSelectedEl) restoreOutline(editSelectedEl);
      editSelectedEl = null;
      clearGroup();
    }
    m.node = dragChrome('z-index:2147483647;border:1px solid rgba(57,135,208,0.95);background:rgba(57,135,208,0.12);border-radius:2px;', 'marquee');
    hideResizeOverlay();
    m.moved = true;
    marqueeFrame();
  }

  function endMarquee(commit) {
    var m = marquee;
    marquee = null;
    if (!m || !m.active) return;
    if (m.raf) cancelAnimationFrame(m.raf);
    // The click or synthetic mouseover that follows the release must not
    // select or hover-outline what is under it.
    dragSuppressClick = true;
    setTimeout(function () { dragSuppressClick = false; }, 0);
    try { document.documentElement.releasePointerCapture(m.pointerId); } catch (relErr) { /* already released */ }
    if (m.node && m.node.parentNode) m.node.parentNode.removeChild(m.node);
    if (editStyleEl) editStyleEl.textContent = editCursorCss();
    var hits = commit && editingActive ? elementsInBox(marqueeRect(m)) : null;
    paintMarqueeHits(m, []);
    if (!hits) {
      if (!m.additive && editingActive) paintPicked(m.base);
      return;
    }
    selectElements(m.additive ? addPicked(m.base, hits) : hits);
  }

  function marqueeOnPointerDown(e) {
    if (!editingActive || dragModeActive || marquee || drag || resize || isResizeHandle(e.target)) return;
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey) return;
    // A finger drag scrolls the page, and so does a plain mouse drag while
    // the touch simulation is on.
    if (e.pointerType === 'touch' || (teardownFn && !e.shiftKey)) return;
    // Text selection inside the live text session and in form fields.
    if (inlineEdit && inlineEdit.el.contains(e.target)) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(e.target.tagName || '')) return;
    marquee = {
      pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
      startPageX: e.clientX + (window.pageXOffset || 0), startPageY: e.clientY + (window.pageYOffset || 0),
      additive: e.shiftKey, active: false, node: null, raf: 0, hits: [], base: [], moved: false
    };
  }

  function marqueeOnPointerMove(e) {
    var m = marquee;
    if (!m || e.pointerId !== m.pointerId) return;
    m.x = e.clientX;
    m.y = e.clientY;
    if (!m.active) {
      var dx = e.clientX - m.startX;
      var dy = e.clientY - m.startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
      // A commit waiting on the parent is about to reload the page, and so
      // is a text session with typing in it (pressing outside blurs it).
      if (!editingActive || dragModeActive || pendingCommits.length) { marquee = null; return; }
      if (inlineEdit) {
        if (inlineHold || !inlineEditUntouched(inlineEdit)) { marquee = null; return; }
        finishInlineEdit(true, false);
      }
      startMarquee();
    }
    e.preventDefault();
    m.moved = true;
  }

  function marqueeOnPointerUp(e) {
    if (!marquee || e.pointerId !== marquee.pointerId) return;
    if (marquee.active) {
      e.preventDefault();
      e.stopPropagation();
    }
    endMarquee(true);
  }

  function marqueeOnPointerCancel(e) {
    if (marquee && e.pointerId === marquee.pointerId) endMarquee(false);
  }

`;
