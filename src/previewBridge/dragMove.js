// Preview bridge source, part 7 of 17. Drag to move: drop targets, the floating copy and the insertion line.
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
export default `  // --- Drag to move ------------------------------------------------------
  // Drag mode only (see dragModeActive). Press on an element and drag it
  // past a small threshold to move it. An insertion line shows where it
  // will land: before or after the element under the pointer, in normal
  // page flow (nothing is absolutely positioned). A press that never
  // crosses the threshold stays a click, which in drag mode only selects
  // (no in-place typing), so select-parent still works. Like every other
  // edit this side only reports: element-drop carries the dragged element's
  // snapshot plus a lite snapshot of the drop target, and the parent moves
  // the source. Pressing inside the selected element drags the selection,
  // which is how a container reached with select-parent gets moved.
  //
  // While a drag is live the dragged element is collapsed out of layout
  // (display:none). The move removes it from its source position first, so
  // the page the drop will actually produce is the page with the element
  // gone: in a grid or flex row, removing the element shifts everything
  // after it, and a line drawn against the un-collapsed layout would point
  // at the wrong spot (the element would land a row or column off). The
  // lifted copy still shows the element under the pointer; collapsing only
  // affects layout, and the element is put back exactly if the drag cancels.

  var DRAG_THRESHOLD = 6;
  var DRAG_EDGE = 48;
  // A dragged element bigger than this floats as a scaled-down copy.
  var DRAG_LIFT_MAX_W = 320;
  var DRAG_LIFT_MAX_H = 240;
  var DRAG_LIFT_NODES = 400;
  var DRAG_SETTLE_MS = 180;
  var DRAG_LINE_TRANSITION = 'left 110ms ease-out, top 110ms ease-out, width 110ms ease-out, height 110ms ease-out, opacity 120ms ease-out';
  var DRAG_CSS = '* { cursor: grabbing !important; -webkit-user-select: none !important; user-select: none !important; } [data-orion-drag], [data-orion-drag] * { pointer-events: none !important; }';
  var PHRASING_PARENT_ROLES = { heading: 1, text: 1, link: 1, button: 1 };
  var REPLACED_TAGS = { IMG: 1, SVG: 1, PICTURE: 1, VIDEO: 1, CANVAS: 1, IFRAME: 1 };
  var STRUCTURED_TAGS = { LI: 1, DT: 1, DD: 1, TR: 1, TD: 1, TH: 1, THEAD: 1, TBODY: 1, TFOOT: 1, OPTION: 1 };
  var STRUCTURED_PARENTS = { UL: 1, OL: 1, MENU: 1, DL: 1, TABLE: 1, THEAD: 1, TBODY: 1, TFOOT: 1, TR: 1, SELECT: 1, DATALIST: 1 };
  var LEAF_DROP_TAGS = {
    IMG: 1, SVG: 1, PICTURE: 1, VIDEO: 1, CANVAS: 1, IFRAME: 1,
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1,
    P: 1, SPAN: 1, STRONG: 1, EM: 1, B: 1, I: 1, U: 1, S: 1, SMALL: 1,
    LABEL: 1, BUTTON: 1, CODE: 1, PRE: 1, BLOCKQUOTE: 1, SUMMARY: 1, FIGCAPTION: 1,
    INPUT: 1, TEXTAREA: 1, SELECT: 1
  };
  var WRAPPER_SKIP_PARENTS = { HTML: 1, HEAD: 1, BODY: 1, MAIN: 1, SECTION: 1, HEADER: 1, FOOTER: 1, ARTICLE: 1, ASIDE: 1, NAV: 1, LI: 1, TD: 1, TH: 1 };
  var drag = null;
  var dragSuppressClick = false;

  function upperTag(el) { return String((el && el.tagName) || '').toUpperCase(); }

  function isInlineBox(el) {
    try { return window.getComputedStyle(el).display === 'inline'; } catch (dErr) { return false; }
  }

  function isOutOfFlow(el) {
    try {
      var pos = window.getComputedStyle(el).position;
      return pos === 'absolute' || pos === 'fixed';
    } catch (posErr) { return false; }
  }

  // Words inside running text (a strong, an inline link, an icon in a
  // heading) move with their paragraph rather than out of it, and a click
  // on an SVG's inner shape or a <picture>'s inner <img> moves the whole graphic.
  function promoteToBlock(el) {
    var node = el;
    try {
      var svg = node.closest ? node.closest('svg') : null;
      if (svg) node = svg;
      var pic = node.closest ? node.closest('picture') : null;
      if (pic) node = pic;
    } catch (svgErr) { /* keep the hit */ }
    while (node && node.parentElement && node.parentElement !== document.body &&
           !REPLACED_TAGS[upperTag(node)] && isInlineBox(node) &&
           PHRASING_PARENT_ROLES[detectRole(node.parentElement)]) {
      node = node.parentElement;
    }
    return node;
  }

  function isMovable(el) {
    if (!isSelectable(el) || !document.body || el === document.body) return false;
    var tag = upperTag(el);
    if (tag === 'HTML' || tag === 'HEAD' || tag === 'BODY' || NON_SIBLING_TAGS[tag]) return false;
    return document.body.contains(el);
  }

  function dragSubjectFor(target) {
    if (!target || target.nodeType !== 1) return null;
    if (editSelectedEl && editSelectedEl.contains(target) && isMovable(editSelectedEl)) return editSelectedEl;
    var el = promoteToBlock(target);
    return isMovable(el) ? el : null;
  }

  var PAGE_SECTION_TAGS = { SECTION: 1, MAIN: 1, HEADER: 1, NAV: 1, FOOTER: 1 };
  var FORM_OR_LIST_CONTROL_TAGS = {
    INPUT: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1, OPTGROUP: 1,
    LABEL: 1, FIELDSET: 1, LEGEND: 1, SUMMARY: 1, DT: 1, DD: 1
  };

  function isPageRootChild(el) {
    var p = el && el.parentElement;
    if (!p) return false;
    var pt = upperTag(p);
    return pt === 'BODY' || pt === 'MAIN';
  }

  function hasStickyOrNavAncestor(el, dragged) {
    for (var cur = el; cur && cur !== document.body && cur !== document.documentElement; cur = cur.parentElement) {
      if (cur.contains(dragged)) return false;
      if (upperTag(cur) === 'NAV') return true;
      try {
        var pos = window.getComputedStyle(cur).position;
        if (pos === 'fixed' || pos === 'sticky') return true;
      } catch (posErr) { /* ignore */ }
    }
    return false;
  }

  function dropTargetAllowed(dragged, target) {
    var role = detectRole(dragged);
    var tt = upperTag(target);
    // Keep non-section elements (images, text, buttons, nested cards) inside
    // page sections rather than naked between sections on <body>/<main>, while
    // still allowing top-level sections to reorder among themselves.
    if (PAGE_SECTION_TAGS[tt] && isPageRootChild(target) && !(role === 'container' && isPageRootChild(dragged))) {
      return false;
    }
    if (FORM_OR_LIST_CONTROL_TAGS[tt]) return false;
    var pt = upperTag(target.parentElement);
    if (pt === 'DL' || pt === 'FIELDSET') return false;
    if (hasStickyOrNavAncestor(target, dragged)) return false;
    return true;
  }

  // Keeps lists and tables valid: list items only among list items, cells
  // only among cells, and nothing else dropped between them. Elements are also
  // kept inside page sections and out of navbars, sticky chrome, and form controls.
  function structureAllows(dragged, target) {
    var dt = upperTag(dragged);
    var tt = upperTag(target);
    if (STRUCTURED_TAGS[dt] || STRUCTURED_TAGS[tt] || STRUCTURED_PARENTS[upperTag(target.parentElement)]) return dt === tt;
    return dropTargetAllowed(dragged, target);
  }

  function validDropTarget(el, dragged) {
    return !!el && isMovable(el) && el !== dragged && !dragged.contains(el) && !el.contains(dragged) &&
      structureAllows(dragged, el);
  }

  function contentChildren(el) {
    var out = [];
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (!NON_SIBLING_TAGS[upperTag(c)] && !isBridgeNode(c)) out.push(c);
    }
    return out;
  }

  function inFlowChildren(el) {
    var all = contentChildren(el);
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (!isOutOfFlow(all[i])) out.push(all[i]);
    }
    return out;
  }

  function inFlowSibling(el, dir) {
    var node = contentSibling(el, dir, true);
    while (node && isOutOfFlow(node)) node = contentSibling(node, dir, true);
    return node;
  }

  // Row layouts (flex rows, grids, inline blocks) take a vertical line and
  // split left/right; everything else splits top/bottom. Out-of-flow siblings
  // (absolute badges, gradient backdrops) do not put an element in a row.
  function sideBySide(el) {
    if (isOutOfFlow(el)) return false;
    var box = el.getBoundingClientRect();
    var sibs = [inFlowSibling(el, -1), inFlowSibling(el, 1)];
    for (var i = 0; i < sibs.length; i++) {
      if (!sibs[i]) continue;
      var other = sibs[i].getBoundingClientRect();
      var overlap = Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top);
      if (overlap > Math.min(box.height, other.height) / 2) return true;
    }
    return false;
  }

  function canDescendDrop(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = upperTag(el);
    if (LEAF_DROP_TAGS[tag]) return false;
    if (tag === 'A') {
      var kids = contentChildren(el);
      if (kids.length < 2) return false;
      for (var i = 0; i < kids.length; i++) {
        if (!isInlineBox(kids[i]) && !REPLACED_TAGS[upperTag(kids[i])]) return true;
      }
      return false;
    }
    return true;
  }

  function sortByDistance(kids, x, y) {
    var items = [];
    for (var i = 0; i < kids.length; i++) {
      var r = kids[i].getBoundingClientRect();
      if (!r.width && !r.height) continue;
      var dx = x < r.left ? r.left - x : (x > r.right ? x - r.right : 0);
      var dy = y < r.top ? r.top - y : (y > r.bottom ? y - r.bottom : 0);
      items.push({ el: kids[i], dist: dx * dx + dy * dy, rect: r });
    }
    items.sort(function (a, b) { return a.dist - b.dist; });
    return items;
  }

  function pointInRect(x, y, r) {
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function onOuterEdge(el, x, y, dragged) {
    if (!validDropTarget(el, dragged)) return false;
    var box = el.getBoundingClientRect();
    if (sideBySide(el)) {
      var edgeX = Math.min(5, box.width / 8);
      return x - box.left < edgeX || box.right - x < edgeX;
    }
    var edgeY = Math.min(5, box.height / 8);
    return y - box.top < edgeY || box.bottom - y < edgeY;
  }

  function drillDropTarget(el, x, y, dragged, fromGap) {
    if (!el || el === dragged) return null;
    if (canDescendDrop(el)) {
      var kids = inFlowChildren(el);
      if (kids.length) {
        var mustDescend = el === document.documentElement || el === document.body ||
          el.contains(dragged) || !structureAllows(dragged, el);
        var keepContainer = !mustDescend && (fromGap || onOuterEdge(el, x, y, dragged));
        if (!keepContainer) {
          var sorted = sortByDistance(kids, x, y);
          for (var i = 0; i < sorted.length; i++) {
            var child = sorted[i].el;
            if (child === dragged) continue;
            var insideChild = pointInRect(x, y, sorted[i].rect);
            var res = drillDropTarget(child, x, y, dragged, !insideChild && kids.length > 1);
            if (res) return res;
            if (insideChild && child.contains(dragged)) return null;
          }
          return null;
        }
      }
    }
    return el;
  }

  // An image inside a single-image frame (<figure>, <a>, <picture>, or an
  // overflow-hidden crop box) cannot take a sibling cleanly inside that frame
  // without clipping; promote the drop target to the frame itself.
  function isSingleImageWrapper(parent, child) {
    if (!parent || parent === document.body || parent === document.documentElement) return false;
    var ptag = upperTag(parent);
    if (WRAPPER_SKIP_PARENTS[ptag]) return false;
    var kids = parent.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var ch = kids[i];
      if (ch === child) continue;
      if (ch.nodeType === 3) {
        if (String(ch.nodeValue || '').trim()) return false;
        continue;
      }
      if (ch.nodeType !== 1 || isBridgeNode(ch) || NON_SIBLING_TAGS[upperTag(ch)]) continue;
      if (isHiddenNode(ch) || isOutOfFlow(ch)) continue;
      return false;
    }
    if (ptag === 'FIGURE' || ptag === 'A' || ptag === 'PICTURE') return true;
    try {
      var cs = window.getComputedStyle(parent);
      return cs.overflowX === 'hidden' || cs.overflowY === 'hidden' || cs.overflowX === 'clip' || cs.overflowY === 'clip';
    } catch (ovErr) { return false; }
  }

  function promoteImageWrapperTarget(el, dragged) {
    var cur = el;
    if (!cur || !REPLACED_TAGS[upperTag(cur)]) return cur;
    while (cur && isSingleImageWrapper(cur.parentElement, cur) && validDropTarget(cur.parentElement, dragged)) {
      cur = cur.parentElement;
    }
    return cur;
  }

  // Where a drop at (x, y) would put the dragged element, or null when it
  // would stay where it is (or there is nowhere valid under the pointer).
  function resolveDrop(x, y, dragged) {
    var hit = null;
    try { hit = document.elementFromPoint(x, y); } catch (hitErr) { hit = null; }
    if (!hit || isBridgeNode(hit) || hit === dragged || dragged.contains(hit)) return null;
    if (hit === document.documentElement && document.body) hit = document.body;
    // A container (or a like-for-like element) dragged over a sibling's
    // content -- a card over another card's heading, a section over the
    // next section's text -- targets the sibling itself: reordering is what
    // that drag means, not nesting one inside the other. Anything else
    // (an image, a paragraph) targets what is under the pointer, so it can
    // be dropped into a nested card or column.
    var sibling = null;
    var reorders = detectRole(dragged) === 'container';
    for (var a = hit; a && a !== document.body; a = a.parentElement) {
      if (a.parentElement === dragged.parentElement) {
        if (reorders || upperTag(a) === upperTag(dragged)) sibling = a;
        break;
      }
    }
    var el = sibling && validDropTarget(sibling, dragged) ? sibling : promoteToBlock(hit);
    if (el !== sibling) {
      var drilled = drillDropTarget(el, x, y, dragged, false);
      if (!drilled) return null;
      el = drilled;
    }
    while (el && !validDropTarget(el, dragged)) {
      if (el.contains(dragged)) return null;
      el = el.parentElement;
    }
    if (!el) return null;
    if (el !== sibling) el = promoteImageWrapperTarget(el, dragged);
    var r = el.getBoundingClientRect();
    var horizontal = sideBySide(el);
    var position = horizontal
      ? (x < r.left + r.width / 2 ? 'before' : 'after')
      : (y < r.top + r.height / 2 ? 'before' : 'after');
    // In a grid or wrapping row, dropping "after" the last item of a row
    // wraps the element to the start of the NEXT row (there is no slot to its
    // right), so the insertion line -- and the drop itself -- must point at
    // that next row's first item instead. "Before" the first item of a row
    // already lands exactly where the line is drawn.
    if (position === 'after' && horizontal) {
      var next = inFlowSibling(el, 1);
      if (next && validDropTarget(next, dragged)) {
        var nb = next.getBoundingClientRect();
        if (nb.top > r.top + r.height / 2) {
          el = next;
          position = 'before';
        }
      }
    }
    if (contentSibling(el, position === 'before' ? -1 : 1) === dragged) return null;
    return { el: el, position: position, horizontal: horizontal };
  }

  function dragChrome(css, role) {
    var node = document.createElement('div');
    node.setAttribute('data-orion-bridge', 'true');
    node.setAttribute('data-orion-drag', role);
    node.style.cssText = 'position:fixed;pointer-events:none;box-sizing:border-box;margin:0;' + css;
    document.documentElement.appendChild(node);
    return node;
  }

  function placeBox(node, left, top, width, height) {
    node.style.left = left + 'px';
    node.style.top = top + 'px';
    node.style.width = Math.max(0, width) + 'px';
    node.style.height = Math.max(0, height) + 'px';
  }

  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (mErr) { return false; }
  }

  // Every computed style is inlined onto the copy so it looks the same while
  // it floats outside the page's selectors (".card img", "#hero h1" no
  // longer match it there). Bounded: past the cap a huge section keeps its
  // plain clone styling rather than stalling the start of the drag.
  function inlineComputed(src, copy, budget) {
    if (budget.left-- <= 0) return;
    var cs = window.getComputedStyle(src);
    var css = '';
    for (var i = 0; i < cs.length; i++) css += cs[i] + ':' + cs.getPropertyValue(cs[i]) + ';';
    copy.style.cssText = css + 'transition:none;animation:none;';
    // Not the editor's hover/selection outline, which is painted inline.
    if (src.__orionOutlineSaved) copy.style.outline = src.__orionOutlineSaved.outline || 'none';
    if (upperTag(src) === 'CANVAS') {
      try { copy.getContext('2d').drawImage(src, 0, 0); } catch (cvErr) { /* tainted or WebGL: stays blank */ }
    }
    for (var a = src.firstElementChild, b = copy.firstElementChild; a && b; a = a.nextElementSibling, b = b.nextElementSibling) {
      inlineComputed(a, b, budget);
    }
  }

  // The copy joins the page, so nothing in it may act like the original:
  // duplicate ids would capture getElementById (and url(#id) still resolves
  // to the original without them), a named checked radio would uncheck its
  // twin, and frames would load again.
  function neuterCopy(copy) {
    var all = [copy].concat(Array.prototype.slice.call(copy.querySelectorAll('*')));
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      var tag = upperTag(n);
      if (tag === 'SCRIPT' || tag === 'IFRAME' || tag === 'OBJECT' || tag === 'EMBED') {
        var stub = document.createElement('div');
        stub.style.cssText = n.style.cssText;
        if (n.parentNode) n.parentNode.replaceChild(stub, n);
        if (n === copy) return stub;
        continue;
      }
      n.removeAttribute('id');
      n.removeAttribute('autofocus');
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') n.removeAttribute('name');
      if (tag === 'VIDEO' || tag === 'AUDIO') {
        n.removeAttribute('autoplay');
        try { n.muted = true; n.pause(); } catch (mvErr) { /* not playable */ }
      }
    }
    return copy;
  }

  // What follows the pointer: a styled copy of the element, shrunk when it is
  // large (a whole section would hide the page it is being dropped into).
  function makeLift(el, rect) {
    var w = el.offsetWidth || rect.width;
    var h = el.offsetHeight || rect.height;
    var lift = dragChrome('z-index:2147483646;left:0;top:0;transform-origin:0 0;will-change:transform,opacity;opacity:0.85;' +
      'width:' + w + 'px;height:' + h + 'px;filter:drop-shadow(0 14px 28px rgba(15,23,42,0.3));', 'lift');
    try {
      var copy = el.cloneNode(true);
      inlineComputed(el, copy, { left: DRAG_LIFT_NODES });
      copy = neuterCopy(copy);
      var display = copy.style.display;
      copy.style.position = 'relative';
      copy.style.left = copy.style.top = copy.style.right = copy.style.bottom = 'auto';
      copy.style.margin = '0';
      copy.style.boxSizing = 'border-box';
      copy.style.width = w + 'px';
      copy.style.height = h + 'px';
      copy.style.minWidth = copy.style.minHeight = '0';
      copy.style.maxWidth = copy.style.maxHeight = 'none';
      copy.style.pointerEvents = 'none';
      if (display === 'inline' || display === 'contents') copy.style.display = 'inline-block';
      lift.appendChild(copy);
    } catch (copyErr) {
      lift.style.background = 'rgba(57,135,208,0.18)';
      lift.style.border = '2px solid rgba(57,135,208,0.9)';
      lift.style.borderRadius = '6px';
    }
    return { node: lift, w: w, h: h };
  }

  function placeLift(d, smooth) {
    // Eased toward its size so lifting a big element shrinks rather than
    // snaps; the point under the pointer stays under it throughout.
    d.scale += (d.scaleTarget - d.scale) * (smooth ? 0.3 : 1);
    var s = d.scale;
    d.lift.style.transform = 'translate3d(' + (d.x - d.grabX * s) + 'px,' + (d.y - d.grabY * s) + 'px,0) scale(' + s + ')';
  }

  // Where the insertion line goes for a drop target, in viewport pixels.
  function lineRect(t) {
    var r = t.el.getBoundingClientRect();
    var vw = window.innerWidth || document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var thick = 5;
    var clamp = function (v, max) { return Math.max(0, Math.min(v, max - thick)); };
    if (t.horizontal) {
      var top = Math.max(0, r.top);
      var bottom = Math.min(vh, r.bottom);
      return { left: clamp(t.position === 'before' ? r.left - thick : r.right, vw), top: top, width: thick, height: Math.max(16, bottom - top) };
    }
    var left = Math.max(0, r.left);
    var right = Math.min(vw, r.right);
    return { left: left, top: clamp(t.position === 'before' ? r.top - thick : r.bottom, vh), width: Math.max(16, right - left), height: thick };
  }

  function clearDragTargetHighlight(d) {
    if (d && d.targetEl) {
      if (!isPicked(d.targetEl)) restoreOutline(d.targetEl);
      d.targetEl = null;
    }
  }

  function paintDrag(scrolled) {
    placeLift(drag, !drag.still);
    var t = drag.target;
    var nextEl = t ? t.el : null;
    if (drag.targetEl !== nextEl) {
      clearDragTargetHighlight(drag);
      if (nextEl && !isPicked(nextEl)) {
        saveOutline(nextEl);
        nextEl.style.outline = '2px dashed rgba(37, 99, 235, 0.55)';
        nextEl.style.outlineOffset = '2px';
        drag.targetEl = nextEl;
      }
    }
    if (!t) { drag.line.style.display = 'none'; return; }
    var lr = lineRect(t);
    if (drag.line.style.display === 'none') {
      // Appears immediately at full opacity where it belongs.
      drag.line.style.transition = 'none';
      drag.line.style.opacity = '1';
      drag.line.style.display = 'block';
      placeBox(drag.line, lr.left, lr.top, lr.width, lr.height);
      return;
    }
    // Glides between spots, but tracks content exactly while auto-scrolling.
    drag.line.style.transition = scrolled || drag.still ? 'none' : DRAG_LINE_TRANSITION;
    placeBox(drag.line, lr.left, lr.top, lr.width, lr.height);
  }

  // Assignments must be instant even on scroll-behavior: smooth pages (see
  // setScrollPosition in the touch simulation); the author's exact style
  // attribute is put back afterwards.
  function scrollInstant(el, dy) {
    var attr = el.getAttribute('style');
    el.style.scrollBehavior = 'auto';
    el.scrollTop += dy;
    if (attr == null) el.removeAttribute('style');
    else el.setAttribute('style', attr);
  }

  function scrollerAt(x, y) {
    var node = null;
    try { node = document.elementFromPoint(x, y); } catch (sErr) { node = null; }
    for (; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      var oy = '';
      try { oy = window.getComputedStyle(node).overflowY; } catch (oErr) { oy = ''; }
      if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node;
    }
    return document.scrollingElement || document.documentElement;
  }

  // One paint per frame: pointermove only records the position (it can fire
  // several times a frame), and this resolves the drop target and moves the
  // chrome in step with the display. Holding the pointer near the top or
  // bottom edge also scrolls, faster the closer it gets, so an element can
  // be carried to any part of the page.
  function dragFrame() {
    if (!drag || !drag.active) return;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var step = 0;
    if (drag.y < DRAG_EDGE) step = -Math.ceil((DRAG_EDGE - drag.y) / 3);
    else if (drag.y > vh - DRAG_EDGE) step = Math.ceil((drag.y - (vh - DRAG_EDGE)) / 3);
    if (step) {
      try { scrollInstant(scrollerAt(drag.x, drag.y), step); } catch (scrollErr) { /* nothing to scroll */ }
    }
    if (step || drag.moved) {
      drag.moved = false;
      drag.target = resolveDrop(drag.x, drag.y, drag.el);
    }
    paintDrag(!!step);
    drag.raf = requestAnimationFrame(dragFrame);
  }

  function startDrag() {
    drag.active = true;
    clearHover();
    try {
      var sel = window.getSelection();
      if (sel) sel.removeAllRanges();
    } catch (selErr) { /* nothing selected */ }
    try { document.documentElement.setPointerCapture(drag.pointerId); } catch (capErr) { /* events still arrive while pressed */ }
    if (editStyleEl) editStyleEl.textContent = editCursorCss() + DRAG_CSS;
    var rect = drag.el.getBoundingClientRect();
    drag.origW = rect.width;
    drag.origH = rect.height;
    try {
      var ocs = window.getComputedStyle(drag.el);
      drag.origPos = ocs.position;
      drag.origBoxSizing = ocs.boxSizing;
      drag.origPadW = (parseFloat(ocs.paddingLeft) || 0) + (parseFloat(ocs.paddingRight) || 0) +
        (parseFloat(ocs.borderLeftWidth) || 0) + (parseFloat(ocs.borderRightWidth) || 0);
      drag.origPadH = (parseFloat(ocs.paddingTop) || 0) + (parseFloat(ocs.paddingBottom) || 0) +
        (parseFloat(ocs.borderTopWidth) || 0) + (parseFloat(ocs.borderBottomWidth) || 0);
    } catch (ocsErr) {
      drag.origPos = '';
      drag.origBoxSizing = 'border-box';
      drag.origPadW = 0;
      drag.origPadH = 0;
    }
    drag.still = reducedMotion();
    drag.line = dragChrome('z-index:2147483647;display:none;background:rgb(37,99,235);border-radius:999px;box-shadow:0 0 0 2px rgba(255,255,255,0.96),0 0 14px 3px rgba(37,99,235,0.55),0 4px 12px rgba(15,23,42,0.38);', 'line');
    var lift = makeLift(drag.el, rect);
    drag.lift = lift.node;
    drag.w = lift.w;
    drag.h = lift.h;
    // The press point inside the element, in its own (unscaled) pixels.
    drag.grabX = (drag.startX - rect.left) * (lift.w / (rect.width || lift.w));
    drag.grabY = (drag.startY - rect.top) * (lift.h / (rect.height || lift.h));
    drag.scale = 1;
    drag.scaleTarget = Math.min(1, DRAG_LIFT_MAX_W / (lift.w || 1), DRAG_LIFT_MAX_H / (lift.h || 1));
    // Collapse the element out of layout for the rest of the drag so the
    // insertion line is drawn against the layout the move will actually
    // produce (see the "Drag to move" note above). The exact style is put
    // back on cancel; on commit the parent reloads the page from the move.
    drag.elStyle = drag.el.getAttribute('style');
    drag.el.style.setProperty('display', 'none', 'important');
    drag.moved = true;
    dragFrame();
  }

  // When an element (sized by w-full, h-full, a narrow card, or a parent CSS
  // rule) moves into a different container, measure how the destination would
  // size it; if an image would change size, lock its rendered size responsively,
  // and if text or a container would stretch wider, cap its width.
  function computeMovePreserveSize(d) {
    var el = d.el;
    if (!el || !(d.origW >= 4) || !(d.origH >= 4)) return null;
    if (d.origPos === 'absolute' || d.origPos === 'fixed') return null;
    var role = detectRole(el);
    var target = d.target && d.target.el;
    if (!target || !target.parentNode) return null;

    var cleanStyle = el.__orionOutlineSaved ? el.__orionOutlineSaved.styleAttr : d.elStyle;
    var probe = null;
    var pr = null;
    var pcs = null;
    try {
      probe = el.cloneNode(true);
      probe = neuterCopy(probe);
      if (cleanStyle == null) probe.removeAttribute('style');
      else probe.setAttribute('style', cleanStyle);
      probe.removeAttribute('data-ab-src');
      var tagged = probe.querySelectorAll ? probe.querySelectorAll('[data-ab-src]') : [];
      for (var ti = 0; ti < tagged.length; ti++) tagged[ti].removeAttribute('data-ab-src');
      probe.style.setProperty('visibility', 'hidden', 'important');
      probe.style.setProperty('pointer-events', 'none', 'important');
      probe.style.setProperty('transition', 'none', 'important');
      probe.style.setProperty('animation', 'none', 'important');
      target.parentNode.insertBefore(probe, d.target.position === 'before' ? target : target.nextSibling);
      pr = probe.getBoundingClientRect();
      pcs = window.getComputedStyle(probe);
    } catch (probeErr) {
      pr = null;
    } finally {
      if (probe && probe.parentNode) probe.parentNode.removeChild(probe);
    }
    if (!pr) return null;

    var isBorderBox = d.origBoxSizing === 'border-box';
    var targetW = Math.max(1, Math.round(isBorderBox ? d.origW : d.origW - (d.origPadW || 0)));
    var targetH = Math.max(1, Math.round(isBorderBox ? d.origH : d.origH - (d.origPadH || 0)));

    if (role === 'image') {
      if (Math.abs(pr.width - d.origW) <= 2 && Math.abs(pr.height - d.origH) <= 2) return null;
      var styles = {
        width: targetW + 'px',
        maxWidth: '100%',
        height: 'auto',
        aspectRatio: targetW + ' / ' + targetH
      };
      if (pcs && (parseFloat(pcs.minWidth) || 0) > targetW) styles.minWidth = '0px';
      if (pcs && (parseFloat(pcs.minHeight) || 0) > targetH) styles.minHeight = '0px';
      if (pcs && (parseFloat(pcs.flexGrow) || 0) > 0) styles.flexGrow = '0';
      if (pcs && pcs.display === 'inline' && upperTag(el) === 'PICTURE') styles.display = 'inline-block';
      return styles;
    }

    if (pcs && pcs.display === 'inline') return null;
    if (role === 'container' || role === 'button' || role === 'link') {
      if (pr.width <= d.origW + 2) return null;
      var boxStyles = { width: targetW + 'px', maxWidth: '100%' };
      if (pcs && (parseFloat(pcs.minWidth) || 0) > targetW) boxStyles.minWidth = '0px';
      if (pcs && (parseFloat(pcs.flexGrow) || 0) > 0) boxStyles.flexGrow = '0';
      return boxStyles;
    }

    if (pr.width <= d.origW + 4) return null;
    return { maxWidth: targetW + 'px' };
  }

  // The copy glides into the insertion line (or back home on a cancel) and
  // fades, rather than vanishing. The parent reloads the page from the moved
  // source meanwhile, and keeps this document on screen until the new one
  // has painted, so the move reads as one motion.
  function settleLift(d, settle) {
    var lift = d.lift;
    if (!lift) return;
    var remove = function () { if (lift.parentNode) lift.parentNode.removeChild(lift); };
    if (d.still) { remove(); return; }
    var s;
    var x;
    var y;
    if (settle) {
      var lr = settle.rect;
      s = d.scale * 0.85;
      x = lr.left + lr.width / 2 - (d.w * s) / 2;
      y = lr.top + lr.height / 2 - (d.h * s) / 2;
    } else {
      var home = d.el.getBoundingClientRect();
      s = (home.width || d.w) / (d.w || 1);
      x = home.left;
      y = home.top;
    }
    lift.style.transition = 'transform ' + DRAG_SETTLE_MS + 'ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity ' + DRAG_SETTLE_MS + 'ms ease-in';
    lift.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + s + ')';
    lift.style.opacity = '0';
    setTimeout(remove, DRAG_SETTLE_MS + 40);
  }

  function endDrag(commit) {
    var d = drag;
    drag = null;
    if (!d || !d.active) return;
    if (d.raf) cancelAnimationFrame(d.raf);
    clearDragTargetHighlight(d);
    try { document.documentElement.releasePointerCapture(d.pointerId); } catch (relErr) { /* already released */ }
    if (d.line && d.line.parentNode) d.line.parentNode.removeChild(d.line);
    var dropping = commit && d.target && editingActive;
    // Capture where the lift should settle and measure destination image size
    // while the dragged element is still collapsed out of layout.
    var settle = dropping ? { rect: lineRect(d.target) } : null;
    var preserveSize = dropping ? computeMovePreserveSize(d) : null;
    var cleanupWrapper = dropping &&
      isSingleImageWrapper(d.el.parentElement, d.el) &&
      d.el.parentElement !== d.target.el && !d.el.parentElement.contains(d.target.el);
    if (d.el) {
      if (d.elStyle == null) d.el.removeAttribute('style');
      else d.el.setAttribute('style', d.elStyle);
    }
    if (editStyleEl) editStyleEl.textContent = editCursorCss();
    // The click that follows the release must not select what is under it.
    // It is dispatched in the same task as pointerup, so clear the flag in
    // the next one in case no click comes.
    dragSuppressClick = true;
    setTimeout(function () { dragSuppressClick = false; }, 0);
    settleLift(d, settle);
    if (!dropping) return;
    var dropPayload = {
      element: buildElementDescription(d.el),
      target: describeLite(d.target.el),
      position: d.target.position
    };
    if (preserveSize) dropPayload.preserveSize = preserveSize;
    if (cleanupWrapper) dropPayload.cleanupWrapper = true;
    post('element-drop', dropPayload);
  }

  function dragOnPointerDown(e) {
    if (!editingActive || !dragModeActive || drag || resize) return;
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    // A finger drag scrolls the page (and the browser cancels the pointer).
    if (e.pointerType === 'touch') return;
    if (inlineEdit && inlineEdit.el.contains(e.target)) return;
    var el = dragSubjectFor(e.target);
    if (!el) return;
    drag = {
      el: el, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
      active: false, target: null, raf: 0, line: null, lift: null, elStyle: null, moved: false
    };
  }

  function dragOnPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.active) {
      var dx = e.clientX - drag.startX;
      var dy = e.clientY - drag.startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
      // A text session (or a commit still waiting on the parent, which is
      // about to reload the page) owns the gesture.
      if (inlineEdit || pendingCommits.length || !editingActive || !dragModeActive) { drag = null; return; }
      startDrag();
    }
    e.preventDefault();
    drag.moved = true;
  }

  function dragOnPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.active) {
      e.preventDefault();
      e.stopPropagation();
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.target = resolveDrop(drag.x, drag.y, drag.el);
    }
    endDrag(true);
  }

  function dragOnPointerCancel(e) {
    if (drag && e.pointerId === drag.pointerId) endDrag(false);
  }

  // Images and links are natively draggable; that drag would take the
  // pointer away from the move gesture.
  function dragOnNativeDragStart(e) {
    if (!editingActive) return;
    if (inlineEdit && inlineEdit.el.contains(e.target)) return;
    e.preventDefault();
  }

`;
