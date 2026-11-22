// Preview bridge source, part 3 of 17. Section 2 (visual editing): shared editing state, outlines, the state badge and element descriptions sent to the parent.
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
export default `  // ------------------------------------------------------------------
  // 2. Visual editing (website studio)
  //
  // When the parent enables editing, this frame becomes an element picker:
  // hover outlines the element under the cursor and click acts on it.
  // Text-bearing elements (headings, paragraphs -- links/buttons on
  // double-click) go straight into IN-PLACE editing: the element becomes
  // contentEditable, the user types on the page itself, and on commit a
  // serialized description captured BEFORE the typing (the original text
  // is the anchor the parent string-matches against) plus the new text
  // is posted as element-text-committed. The parent applies the change
  // to the source HTML and answers inline-edit-result; only a failure
  // (or a timeout) restores the original text here, so the frame and the
  // source never disagree for longer than one round trip. Non-text
  // elements select as before and the parent shows its editor panel;
  // this side never mutates the source -- outlines are inline styles,
  // typing is live-DOM only and always reverts unless the parent
  // confirms. Escape during in-place editing cancels the typing and
  // reports the element as selected (the panel's escape hatch, e.g. for
  // select-parent); select-parent walks the selection up one ancestor at
  // a time so containers (section backgrounds, wallpaper) can be reached
  // from their children. Dragging an element moves it (see "Drag to move"
  // below), in drag mode only; outside it, dragging draws a box that selects
  // several elements at once (see "Box select").
  // ------------------------------------------------------------------

  var editingActive = false;
  var editHoveredEl = null;
  var editSelectedEl = null;
  var editChildStack = [];
  var editStyleEl = null;
  var stateBadge = null;
  var inlineEdit = null;
  var inlineHold = false;
  var inlineEditSequence = 0;
  var pendingCommits = [];
  var pendingResizes = [];

  var EDIT_HOVER_OUTLINE = '2px dashed rgba(57, 135, 208, 0.85)';
  var EDIT_SELECT_OUTLINE = '3px solid rgba(57, 135, 208, 1)';
  var EDIT_INLINE_OUTLINE = '2px solid rgba(14, 165, 233, 0.95)';
  var EDIT_CURSOR_CSS = '*:not([data-orion-resize-handle]):not([contenteditable]):not([contenteditable] *) { cursor: crosshair !important; } [contenteditable], [contenteditable] * { cursor: text !important; }';
  var DRAG_MODE_CURSOR_CSS = '* { cursor: grab !important; }';
  // Dragging is unified with visual editing: pressing and dragging moves an
  // element, while a click without dragging selects or edits in place.
  var dragModeActive = false;
  // Container lock (right-click toggle on images): when active, shrinking an
  // image smaller than its single-image container also shrinks the container
  // to hug the image.
  var containerLockActive = false;
  var imageContextMenuActive = false;

  function editCursorCss() { return EDIT_CURSOR_CSS; }

  function elementDisplayLabel(el) {
    if (!el || !el.tagName) return 'Element';
    var tag = el.tagName.toLowerCase();
    var cls = '';
    try { cls = String(el.getAttribute('class') || ''); } catch (cErr) { cls = ''; }
    if (/^h[1-6]$/.test(tag)) return 'Heading (' + tag.toUpperCase() + ')';
    if (tag === 'button' || (el.getAttribute && el.getAttribute('role') === 'button')) return 'Button';
    if (tag === 'a') return /(^|\\s)(btn|button|cta)(\\s|$)|bg-|rounded-(full|xl|lg|2xl)/i.test(cls) ? 'Button Link' : 'Link';
    if (tag === 'img' || tag === 'picture' || tag === 'svg' || tag === 'video' || tag === 'canvas') return 'Image';
    if (tag === 'nav') return 'Navigation';
    if (tag === 'header') return 'Header';
    if (tag === 'footer') return 'Footer';
    if (tag === 'section' || tag === 'main' || tag === 'article') return 'Section';
    if (tag === 'ul' || tag === 'ol') return 'List';
    if (tag === 'li') return 'List item';
    if (tag === 'blockquote') return 'Quote';
    if (tag === 'p') return 'Paragraph';
    if (tag === 'span' || tag === 'strong' || tag === 'em' || tag === 'small' || tag === 'label') return 'Text';
    if (/(^|\\s|-)(card|tile|plan|tier|panel|feature|box)(\\s|-|$)/i.test(cls)) return 'Card';
    if (/(^|\\s|-)(grid|row|cols|flex|stack|list|cards)(\\s|-|$)/i.test(cls)) return 'Container';
    if (tag === 'div') return 'Container';
    return 'Section';
  }

  function hideStateBadge() {
    if (stateBadge && stateBadge.parentNode) stateBadge.parentNode.removeChild(stateBadge);
    stateBadge = null;
  }

  function syncStateBadge() {
    if (!editingActive || (drag && drag.active) || (marquee && marquee.active) || resize || insertMenuOpen) {
      hideStateBadge();
      return;
    }
    var target = null;
    var mode = '';
    var text = '';
    var bg = '';
    if (inlineEdit && inlineEdit.el && document.body && document.body.contains(inlineEdit.el)) {
      target = inlineEdit.el;
      mode = 'editing';
      text = 'Editing · ' + elementDisplayLabel(target);
      bg = 'rgba(14, 165, 233, 0.96)';
    } else if (editSelectedEl && !editGroupEls.length && document.body && document.body.contains(editSelectedEl)) {
      target = editSelectedEl;
      mode = 'selected';
      text = 'Selected · ' + elementDisplayLabel(target);
      bg = 'rgba(30, 89, 143, 0.96)';
    } else if (editHoveredEl && !isPicked(editHoveredEl) && document.body && document.body.contains(editHoveredEl)) {
      target = editHoveredEl;
      mode = 'hover';
      text = elementDisplayLabel(target);
      bg = 'rgba(15, 23, 42, 0.84)';
    }
    if (!target) {
      hideStateBadge();
      return;
    }
    var r;
    try { r = target.getBoundingClientRect(); } catch (bErr) { hideStateBadge(); return; }
    if (!r || (r.width < 2 && r.height < 2)) { hideStateBadge(); return; }
    if (!stateBadge || !stateBadge.parentNode) {
      stateBadge = document.createElement('span');
      stateBadge.setAttribute('data-orion-bridge', 'true');
      stateBadge.setAttribute('data-orion-badge', 'true');
      document.documentElement.appendChild(stateBadge);
    }
    stateBadge.setAttribute('data-orion-state', mode);
    stateBadge.textContent = text;
    stateBadge.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;padding:2px 7px;border-radius:5px;' +
      'background:' + bg + ';color:#fff;font:600 11px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
      'letter-spacing:0.01em;box-shadow:0 2px 6px rgba(15,23,42,0.25);white-space:nowrap;';
    var vw = window.innerWidth || document.documentElement.clientWidth || 800;
    var vh = window.innerHeight || document.documentElement.clientHeight || 600;
    var bw = Math.max(54, stateBadge.offsetWidth || Math.round(text.length * 6.5 + 16));
    var bh = Math.max(20, stateBadge.offsetHeight || 0);
    var left = Math.max(4, Math.min(r.left, vw - bw - 4));
    // Prefer above the element; if there isn't room above (e.g. top navbar links),
    // place below so the badge never covers the element. Fall back to inside only
    // when the element spans near both the top and bottom of the viewport.
    var top;
    if (r.top >= bh + 4) {
      top = r.top - bh - 3;
    } else if (r.bottom + bh + 4 <= vh) {
      top = Math.max(4, r.bottom + 3);
    } else {
      top = Math.min(vh - bh - 4, Math.max(4, r.top + 4));
    }
    stateBadge.style.left = Math.round(left) + 'px';
    stateBadge.style.top = Math.round(top) + 'px';
  }

  function isBridgeNode(el) {
    var node = el;
    while (node && node !== document.documentElement) {
      if (node.getAttribute && node.getAttribute('data-orion-bridge') === 'true') return true;
      node = node.parentElement;
    }
    return false;
  }

  function isSelectable(el) {
    if (!el || el.nodeType !== 1 || !el.tagName) return false;
    if (el === document.documentElement) return false;
    if (isBridgeNode(el)) return false;
    return true;
  }

  function saveOutline(el) {
    if (!el || el.__orionOutlineSaved) return;
    el.__orionOutlineSaved = { outline: el.style.outline, offset: el.style.outlineOffset, styleAttr: el.getAttribute('style') };
  }

  function restoreOutline(el) {
    if (!el || !el.__orionOutlineSaved) return;
    el.style.outline = el.__orionOutlineSaved.outline;
    el.style.outlineOffset = el.__orionOutlineSaved.offset;
    // Writing style properties re-serializes the whole style attribute
    // ("background:#fff" becomes "background: rgb(255, 255, 255);") and can
    // leave an empty style="". Put the author's exact string back -- the
    // parent matches reports against the source text -- unless the page has
    // changed the element's styles in the meantime.
    try {
      var savedAttr = el.__orionOutlineSaved.styleAttr;
      if (savedAttr == null) {
        if (el.style.length === 0) el.removeAttribute('style');
      } else {
        var probe = document.createElement('span');
        probe.setAttribute('style', savedAttr);
        if (probe.style.cssText === el.style.cssText) el.setAttribute('style', savedAttr);
      }
    } catch (attrErr) { /* keep the serialized form */ }
    el.__orionOutlineSaved = null;
  }

  // A multi-selection (box select or Shift+click, see "Box select" below):
  // two or more elements, reported together as elements-selected. While it
  // is non-empty editSelectedEl is null.
  var editGroupEls = [];

  function isPicked(el) {
    return el === editSelectedEl || editGroupEls.indexOf(el) !== -1;
  }

  function paintHover(el) {
    if (!el || isPicked(el)) return;
    saveOutline(el);
    el.style.outline = EDIT_HOVER_OUTLINE;
    el.style.outlineOffset = '1px';
    syncStateBadge();
  }

  function clearHover() {
    // The insert menu's subject keeps its outline until the menu closes.
    if (editHoveredEl && !isPicked(editHoveredEl) && editHoveredEl !== insertSubject) restoreOutline(editHoveredEl);
    editHoveredEl = null;
    syncStateBadge();
  }

  function paintSelection(el) {
    if (!el) return;
    saveOutline(el);
    el.style.outline = EDIT_SELECT_OUTLINE;
    el.style.outlineOffset = '1px';
    syncStateBadge();
  }

  function paintInlineEdit(el) {
    if (!el) return;
    saveOutline(el);
    el.style.outline = EDIT_INLINE_OUTLINE;
    el.style.outlineOffset = '3px';
    syncStateBadge();
  }

  function clearGroup() {
    for (var i = 0; i < editGroupEls.length; i++) restoreOutline(editGroupEls[i]);
    editGroupEls = [];
  }

  function detectRole(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'img' || tag === 'picture' || tag === 'svg' || tag === 'video' || tag === 'canvas') return 'image';
    if (tag === 'a') return 'link';
    if (tag === 'button' || el.getAttribute('role') === 'button') return 'button';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'p' || tag === 'span' || tag === 'li' || tag === 'strong' || tag === 'em' ||
        tag === 'small' || tag === 'label' || tag === 'blockquote' || tag === 'figcaption' ||
        tag === 'td' || tag === 'th' || tag === 'dt' || tag === 'dd' || tag === 'time' ||
        tag === 'figcaption' || tag === 'code' || tag === 'pre') {
      return 'text';
    }
    return 'container';
  }

  function capString(str, n) {
    str = String(str == null ? '' : str);
    return str.length > n ? str.slice(0, n) : str;
  }

  function collapseText(el) {
    try {
      // Note: this lives inside a template literal -- backslashes must be
      // doubled or the frame receives a backslash-less regex.
      return capString(String(el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim(), 600);
    } catch (err) {
      return '';
    }
  }

  // The bridge paints hover/selection outlines through the element's inline
  // style, so the live style attribute (and every outerHTML that contains
  // it) differs from the source the parent has to match against. Reports are
  // built with the pre-paint style attributes temporarily put back.
  function withOriginalStyleAttrs(el, fn) {
    var painted = [];
    var nodes = [el];
    try {
      var all = el.querySelectorAll('*');
      for (var n = 0; n < all.length; n++) nodes.push(all[n]);
    } catch (qErr) { /* just the element itself */ }
    for (var i = 0; i < nodes.length; i++) {
      var saved = nodes[i].__orionOutlineSaved;
      if (!saved) continue;
      painted.push({ node: nodes[i], current: nodes[i].getAttribute('style') });
      if (saved.styleAttr == null) nodes[i].removeAttribute('style');
      else nodes[i].setAttribute('style', saved.styleAttr);
    }
    try {
      return fn();
    } finally {
      for (var j = 0; j < painted.length; j++) {
        if (painted[j].current == null) painted[j].node.removeAttribute('style');
        else painted[j].node.setAttribute('style', painted[j].current);
      }
    }
  }

  function buildElementDescription(el) {
    return withOriginalStyleAttrs(el, function () { return buildElementDescriptionRaw(el); });
  }

  // Current text formatting, for the parent's text toolbar. Computed values:
  // what the user actually sees, whatever mix of classes and inline style got
  // it there.
  function readTypography(el) {
    var cs = null;
    try { cs = window.getComputedStyle(el); } catch (csErr) { return null; }
    var weight = parseInt(cs.fontWeight, 10);
    if (isNaN(weight)) weight = cs.fontWeight === 'bold' ? 700 : 400;
    var align = cs.textAlign;
    if (align === 'start') align = 'left';
    else if (align === 'end') align = 'right';
    return {
      fontFamily: capString(cs.fontFamily, 300),
      fontSize: parseFloat(cs.fontSize) || 16,
      fontWeight: weight,
      fontStyle: cs.fontStyle === 'italic' || cs.fontStyle === 'oblique' ? 'italic' : 'normal',
      underline: String(cs.textDecorationLine || '').indexOf('underline') !== -1,
      textAlign: align,
      textTransform: cs.textTransform,
      color: capString(cs.color, 100),
      display: cs.display
    };
  }

  var REPORTED_ATTRS = ['src', 'srcset', 'href', 'target', 'rel', 'alt', 'title', 'aria-label', 'placeholder', 'type', 'class', 'style', 'id'];

  function readReportedAttributes(el) {
    var attributes = {};
    for (var i = 0; i < REPORTED_ATTRS.length; i++) {
      var name = REPORTED_ATTRS[i];
      var value;
      try { value = el.getAttribute(name); } catch (attrErr) { value = null; }
      if (value != null) attributes[name] = capString(value, name === 'class' || name === 'style' ? 3000 : 1500);
    }
    return attributes;
  }

  // Website Studio previews number every source tag (lib/sourcePositions.js);
  // SOURCE_FP fingerprints the source those numbers belong to, null when the
  // page is not numbered.
  var SOURCE_FP = __ORION_SOURCE_FP__;

  // The element's source number, or null when it has none or a script has
  // copied it onto other elements too (the number no longer says which).
  function sourceIdOf(el) {
    if (!SOURCE_FP) return null;
    var value = null;
    try { value = el.getAttribute('data-ab-src'); } catch (srcAttrErr) { value = null; }
    if (value == null || !/^\\d+$/.test(value)) return null;
    try {
      if (document.querySelectorAll('[data-ab-src="' + value + '"]').length !== 1) return null;
    } catch (srcQueryErr) { return null; }
    return parseInt(value, 10);
  }

  // Serialized markup as the source has it: without the preview's numbers.
  function sourceOuterHTML(el) {
    var html = '';
    try { html = el.outerHTML || ''; } catch (outerErr) { html = ''; }
    // The YouTube poster (see swapYouTubeFrame) is not in the source either.
    // Serialized attribute values never hold a raw double quote.
    if (html.indexOf(' data-ab-yt=""') !== -1) html = html.replace(/ srcdoc="[^"]*" data-ab-yt=""/g, '');
    return SOURCE_FP ? html.replace(/ data-ab-src="\\d+"/g, '') : html;
  }

  function fullTextOf(el) {
    try { return String(el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim(); } catch (textErr) { return ''; }
  }

  // Rank of this element among same-tag elements with identical visible
  // text (document order). Lets the parent pick the right source
  // occurrence when the text repeats (e.g. brand name in header + footer).
  function textRank(el, fullText) {
    var rank = { ordinal: -1, count: 0 };
    if (!fullText || fullText.length > 600) return rank;
    try {
      var sameTag = document.getElementsByTagName(el.tagName);
      if (sameTag.length > 3000) return rank;
      var wantedText = fullText.toLowerCase();
      for (var s = 0; s < sameTag.length; s++) {
        if (collapseText(sameTag[s]).toLowerCase() === wantedText) {
          if (sameTag[s] === el) rank.ordinal = rank.count;
          rank.count++;
        }
      }
    } catch (ordErr) { return { ordinal: -1, count: 0 }; }
    return rank;
  }

  // Rank among ALL same-tag elements (bridge nodes excluded). The parent
  // uses it as a last resort to find text-less elements (spacers, images
  // without a unique src, huge sections) and only when its own source count
  // agrees.
  function tagRank(el) {
    var rank = { ordinal: -1, count: 0 };
    try {
      var same = document.getElementsByTagName(el.tagName);
      if (same.length > 5000) return rank;
      for (var i = 0; i < same.length; i++) {
        if (isBridgeNode(same[i])) continue;
        if (same[i] === el) rank.ordinal = rank.count;
        rank.count++;
      }
    } catch (rankErr) { return { ordinal: -1, count: 0 }; }
    return rank;
  }

  // Leading textContent (hidden descendants included), which the parent
  // checks a rank-only match against.
  function rawTextOf(el) {
    try { return capString(String(el.textContent || '').replace(/\\s+/g, ' ').trim(), 200); } catch (rawErr) { return ''; }
  }

  // Just enough of an element for the parent to locate it in the source:
  // what a sibling needs for move-up / move-down.
  function describeLite(el) {
    return withOriginalStyleAttrs(el, function () {
      var fullText = fullTextOf(el);
      var outerFull = sourceOuterHTML(el);
      var tr = textRank(el, fullText);
      var gr = tagRank(el);
      return {
        tag: el.tagName.toLowerCase(),
        srcId: sourceIdOf(el),
        srcFingerprint: SOURCE_FP,
        role: detectRole(el),
        text: capString(fullText, 600),
        textTruncated: fullText.length > 600,
        rawText: rawTextOf(el),
        textOrdinal: tr.ordinal,
        textCount: tr.count,
        tagOrdinal: gr.ordinal,
        tagCount: gr.count,
        attributes: readReportedAttributes(el),
        outerHTML: capString(outerFull, 4000),
        outerHTMLTruncated: outerFull.length > 4000
      };
    });
  }

  var NON_SIBLING_TAGS = { SCRIPT: 1, STYLE: 1, TEMPLATE: 1, LINK: 1, META: 1, NOSCRIPT: 1 };

  // Nearest element sibling in direction dir that is real page content.
  // With skipHidden, elements collapsed out of layout (display:none -- the
  // dragged element while it is being lifted) are passed over too, so row
  // detection still works when the only other item in a row is hidden.
  function contentSibling(el, dir, skipHidden) {
    var node = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
    while (node && (NON_SIBLING_TAGS[node.tagName] || isBridgeNode(node) || (skipHidden && isHiddenNode(node)))) {
      node = dir < 0 ? node.previousElementSibling : node.nextElementSibling;
    }
    return node || null;
  }

  function isHiddenNode(node) {
    try { return window.getComputedStyle(node).display === 'none'; } catch (hErr) { return false; }
  }

  function buildElementDescriptionRaw(el) {
    var tag = el.tagName.toLowerCase();
    var attributes = readReportedAttributes(el);

    var computed = null;
    try { computed = window.getComputedStyle(el); } catch (styleErr) { computed = null; }

    var rect = null;
    try {
      var box = el.getBoundingClientRect();
      rect = { x: box.left, y: box.top, width: box.width, height: box.height };
    } catch (rectErr) { rect = null; }

    var fullText = fullTextOf(el);

    var outerFull = sourceOuterHTML(el);

    var parent = el.parentElement || null;
    var parentSelectable = false;
    var parentTag = null;
    var parentText = null;
    if (parent && parent !== document.documentElement) {
      parentTag = parent.tagName ? parent.tagName.toLowerCase() : null;
      parentSelectable = true;
      parentText = collapseText(parent);
    }

    var childIndex = -1;
    if (parent && parent.children) {
      for (var c = 0; c < parent.children.length; c++) {
        if (parent.children[c] === el) { childIndex = c; break; }
      }
    }

    var tr = textRank(el, fullText);
    var gr = tagRank(el);
    var isRoot = tag === 'html' || tag === 'head' || tag === 'body';
    var prevSib = isRoot ? null : contentSibling(el, -1);
    var nextSib = isRoot ? null : contentSibling(el, 1);

    var ancestors = [];
    var anc = el.parentElement;
    var stepsUp = 1;
    while (anc && anc !== document.documentElement && stepsUp <= 6) {
      var ancTag = anc.tagName ? anc.tagName.toLowerCase() : '';
      if (ancTag && ancTag !== 'html' && ancTag !== 'head' && (ancTag !== 'body' || stepsUp === 1)) {
        ancestors.unshift({
          stepsUp: stepsUp,
          tag: ancTag,
          role: detectRole(anc),
          label: elementDisplayLabel(anc)
        });
      }
      if (ancTag === 'body') break;
      anc = anc.parentElement;
      stepsUp += 1;
    }

    var validChildStack = [];
    for (var csIdx = editChildStack.length - 1; csIdx >= 0; csIdx--) {
      var cNode = editChildStack[csIdx];
      if (cNode && document.body && document.body.contains(cNode)) {
        validChildStack.push({
          stepsDown: validChildStack.length + 1,
          tag: cNode.tagName.toLowerCase(),
          role: detectRole(cNode),
          label: elementDisplayLabel(cNode),
          text: capString(fullTextOf(cNode), 80)
        });
      }
    }

    var payload = {
      tag: tag,
      srcId: sourceIdOf(el),
      srcFingerprint: SOURCE_FP,
      role: detectRole(el),
      displayLabel: elementDisplayLabel(el),
      textOrdinal: tr.ordinal,
      textCount: tr.count,
      tagOrdinal: gr.ordinal,
      tagCount: gr.count,
      text: capString(fullText, 600),
      rawText: rawTextOf(el),
      textTruncated: fullText.length > 600,
      attributes: attributes,
      backgroundColor: computed ? capString(computed.backgroundColor, 100) : null,
      backgroundImage: computed && computed.backgroundImage && computed.backgroundImage !== 'none'
        ? capString(computed.backgroundImage, 500)
        : null,
      color: computed ? capString(computed.color, 100) : null,
      outerHTML: capString(outerFull, 4000),
      outerHTMLTruncated: outerFull.length > 4000,
      parentTag: parentTag,
      parentSelectable: parentSelectable,
      parentText: parentText,
      ancestors: ancestors,
      childSelectable: validChildStack.length > 0,
      childStack: validChildStack,
      childIndex: childIndex,
      typography: readTypography(el),
      boundingBox: rect,
      prevSibling: prevSib ? describeLite(prevSib) : null,
      nextSibling: nextSib ? describeLite(nextSib) : null,
      scroll: { x: window.pageXOffset || 0, y: window.pageYOffset || 0 }
    };
    return payload;
  }

  function describeElement(el) {
    post('element-selected', buildElementDescription(el));
  }

`;
