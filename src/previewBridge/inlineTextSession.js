// Preview bridge source, part 5 of 17. In-place text editing: whitespace handling, the caret, and starting an edit (tryStartInlineEdit).
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
export default `  // Editing hosts render whitespace differently from static text: Blink
  // paints a typing host with pre-wrap semantics, so pretty-printed source
  // indentation (newline + spaces around the text) -- which normal
  // white-space collapsing renders as nothing -- suddenly occupies real
  // space, and the text visibly shifts (right/off-center, a line down) the
  // moment the element becomes editable. The internal pre-wrap cannot be
  // overridden by an author white-space value, so the whitespace itself is
  // what has to go: every text node in the subtree is collapsed to normal
  // white-space semantics, which renders identically to the static view
  // under BOTH normal and pre-wrap. That means more than trimming the
  // element's first and last text: a space is also dropped where a line
  // starts or ends -- next to a <br>, a nested block (a hero title's
  // "display:block" second line), or each item of a flex/grid host -- and
  // where it follows another space across an inline boundary
  // ("Build " followed by a span holding " amazing"). Any of those survives pre-wrap as a
  // visible space and nudges that line right or off-center. Non-breaking
  // spaces are content, not collapsible whitespace, and stay. Preformatted
  // subtrees keep their significant whitespace. The original markup is safe
  // in entry.origHtml (restored on cancel/failure), and the parent's match
  // snapshot was taken before any of this runs.
  var WS_SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEMPLATE: 1, NOSCRIPT: 1 };
  var WS_ATOM_TAGS = { TEXTAREA: 1, PRE: 1, IMG: 1, SVG: 1, svg: 1, VIDEO: 1, CANVAS: 1, IFRAME: 1, INPUT: 1, SELECT: 1, BUTTON: 1, OBJECT: 1, EMBED: 1 };
  var WS_BREAK = { wsBreak: true };
  var WS_ATOM = { wsAtom: true };

  function wsIsPreformatted(ws) {
    return ws === 'pre' || ws === 'pre-wrap' || ws === 'break-spaces' || ws === 'pre-line';
  }

  function wsIsFlexOrGrid(display) {
    return /(^|\\s|-)(flex|grid)(\\s|$)/.test(display || '');
  }

  // Returns the subtree as runs (one per formatting context) of text nodes,
  // WS_BREAK (a line starts/ends here) and WS_ATOM (non-space inline content
  // such as an image or an inline-block).
  function collectEditingTextNodes(root) {
    var runs = [];
    var rootDisplay = '';
    try { rootDisplay = window.getComputedStyle(root).display || ''; } catch (rdErr) { rootDisplay = ''; }
    var visit = function (node, run, itemized) {
      for (var child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 3) {
          run.push(child);
          continue;
        }
        if (child.nodeType !== 1 || WS_SKIP_TAGS[child.nodeName]) continue;
        if (child.nodeName === 'BR') { run.push(WS_BREAK); continue; }
        var cs = null;
        try { cs = window.getComputedStyle(child); } catch (csErr) { cs = null; }
        var display = (cs && cs.display) || 'inline';
        if (display === 'none') continue;
        var isInline = display === 'inline' || display === 'contents';
        var isInlineLevel = isInline || display.indexOf('inline') === 0;
        // Flex/grid items are blockified: each child starts its own line.
        var boundary = itemized || !isInlineLevel;
        if (boundary) run.push(WS_BREAK);
        if (WS_ATOM_TAGS[child.nodeName] || (cs && wsIsPreformatted(cs.whiteSpace))) {
          run.push(WS_ATOM);
        } else if (isInline && !itemized) {
          visit(child, run, false);
        } else if (isInlineLevel && !itemized) {
          // inline-block & co: content on the outer line, own lines inside.
          run.push(WS_ATOM);
          var inner = [];
          runs.push(inner);
          visit(child, inner, wsIsFlexOrGrid(display));
        } else {
          visit(child, run, wsIsFlexOrGrid(display));
        }
        if (boundary) run.push(WS_BREAK);
      }
    };
    var outer = [];
    runs.push(outer);
    visit(root, outer, wsIsFlexOrGrid(rootDisplay));
    return runs;
  }

  // Collapses one run the way CSS phase-I white-space processing would.
  function collapseEditingRun(run) {
    var dropLeading = true; // line start, or the previous text ended in a space
    var pending = null; // last kept text node ending in a space
    var trimPending = function () {
      if (!pending) return;
      var v = pending.nodeValue.replace(/ $/, '');
      if (v === '' && pending.parentNode) pending.parentNode.removeChild(pending);
      else pending.nodeValue = v;
      pending = null;
    };
    for (var i = 0; i <= run.length; i++) {
      var item = i < run.length ? run[i] : WS_BREAK;
      if (item === WS_BREAK) { trimPending(); dropLeading = true; continue; }
      if (item === WS_ATOM) { pending = null; dropLeading = false; continue; }
      var value = item.nodeValue;
      var collapsed = value.replace(/[ \\t\\n\\r\\f]+/g, ' ');
      if (dropLeading) collapsed = collapsed.replace(/^ /, '');
      if (collapsed === '') {
        if (item.parentNode) item.parentNode.removeChild(item);
        continue;
      }
      if (collapsed !== value) item.nodeValue = collapsed;
      // A following space collapses into this one, and a line end trims it.
      dropLeading = collapsed.charAt(collapsed.length - 1) === ' ';
      pending = dropLeading ? item : null;
    }
  }

  // The text nodes must be collected BEFORE the element becomes a contenteditable
  // host: afterwards every descendant inherits the host's pre-wrap, so
  // collectEditingTextNodes would treat nested inline elements as
  // "preformatted" and leave their whitespace alone.
  function stabilizeInlineHost(el, hostWhiteSpace, runs) {
    // The caller reads this BEFORE entering edit mode: once the element is a
    // contenteditable host, Blink's UA style already reports pre-wrap, so
    // reading it here would always look preformatted and skip the fix.
    if (hostWhiteSpace !== 'normal' && hostWhiteSpace !== 'nowrap') return;
    // Best effort only: Blink keeps rendering the host as pre-wrap even with
    // an author value, which is exactly why the DOM is normalized below.
    el.style.whiteSpace = hostWhiteSpace;
    try {
      for (var r = 0; r < runs.length; r++) collapseEditingRun(runs[r]);
    } catch (trimErr) { /* worst case is the pre-fix shift, never a crash */ }
  }

  // The caret defaults to the text color, which makes it invisible whenever
  // the text is transparent (gradient/clipped text), matches its background,
  // or the page sets caret-color itself. Picks a caret color that is visible
  // for the edit session; the caller restores the inline value afterwards.
  var caretCtx = null;
  function parseCssColor(value) {
    try {
      if (!caretCtx) {
        var canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        caretCtx = canvas.getContext('2d', { willReadFrequently: true });
      }
      caretCtx.clearRect(0, 0, 1, 1);
      caretCtx.fillStyle = '#000';
      caretCtx.fillStyle = value;
      caretCtx.fillRect(0, 0, 1, 1);
      var d = caretCtx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    } catch (colorErr) { return null; }
  }

  function relLuminance(c) {
    var lin = function (v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  }

  // First mostly-opaque background color behind the element. Returns null
  // when an image/gradient is hit first (unknowable), white when nothing
  // paints (the canvas default).
  function effectiveBackground(el) {
    var node = el;
    while (node && node.nodeType === 1) {
      var cs = window.getComputedStyle(node);
      var bg = parseCssColor(cs.backgroundColor);
      if (bg && bg.a >= 0.5) return bg;
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  // An opaque text color is the most reliable caret: it was chosen to be
  // readable against whatever actually paints behind it, which the
  // ancestor walk cannot see (absolutely positioned images/overlays,
  // pseudo-elements). Only transparent text falls back to guessing from
  // the background.
  function chooseCaretColor(el) {
    try {
      var cs = window.getComputedStyle(el);
      var text = parseCssColor(cs.color);
      var textVisible = !!text && text.a >= 0.5;
      if (cs.caretColor && cs.caretColor !== 'auto') {
        var own = parseCssColor(cs.caretColor);
        var ownVisible = !!own && own.a >= 0.5;
        if (ownVisible && textVisible && own.r === text.r && own.g === text.g && own.b === text.b) return null;
        if (textVisible) return cs.color;
        if (ownVisible) return null;
      } else if (textVisible) {
        return null;
      }
      var bg = effectiveBackground(el);
      if (!bg) return '#3987d0';
      return relLuminance(bg) > 0.4 ? '#000000' : '#ffffff';
    } catch (caretErr) { return null; }
  }

  // Text-bearing roles only (defense in depth for the dblclick path):
  // containers/images report descendant text that would pass the text
  // checks, but flattening a whole section is never what a click
  // means. Returns false (caller falls back to select + panel) when the
  // element cannot be anchored deterministically: no text, text over the
  // report cap, or a form control.
  // Collapsed range at the clicked point, so entering edit mode puts the
  // caret where the user clicked instead of selecting all the text. Null
  // when there is no point or it resolves outside the element.
  function caretRangeAtPoint(el, point) {
    if (!point) return null;
    try {
      var range = null;
      if (document.caretPositionFromPoint) {
        var pos = document.caretPositionFromPoint(point.x, point.y);
        if (pos && pos.offsetNode) {
          range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
        }
      } else if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(point.x, point.y);
      }
      if (!range || !el.contains(range.startContainer)) return null;
      range.collapse(true);
      return range;
    } catch (pointErr) { return null; }
  }

  // Blink draws the native caret as tall as the font's whole content area
  // (ascent + descent, ~1.1em), which on large hero text towers over the
  // letters, and no CSS can shorten it. During an edit the native caret is
  // made transparent and a slimmer one is drawn at the same spot.
  var fakeCaret = null;
  var fakeCaretTimer = null;
  var fakeCaretOnMove = null;
  function caretRectFor(el) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed || !el.contains(sel.anchorNode)) return null;
    var range = sel.getRangeAt(0).cloneRange();
    var rects = range.getClientRects();
    if (rects.length) return { left: rects[0].left, top: rects[0].top, height: rects[0].height };
    // A caret at the very end of the element has no rect of its own:
    // borrow the right edge of the last character instead.
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var last = null;
    while (walker.nextNode()) { if (walker.currentNode.nodeValue.length) last = walker.currentNode; }
    if (last) {
      var r = document.createRange();
      r.setStart(last, last.nodeValue.length - 1);
      r.setEnd(last, last.nodeValue.length);
      var lr = r.getClientRects();
      if (lr.length) {
        var tail = lr[lr.length - 1];
        return { left: tail.right, top: tail.top, height: tail.height };
      }
    }
    var box = el.getBoundingClientRect();
    return { left: box.left, top: box.top, height: box.height };
  }
  function updateFakeCaret(entry) {
    if (!fakeCaret) return;
    try {
      var pos = caretRectFor(entry.el);
      if (!pos) { fakeCaret.style.display = 'none'; return; }
      var fs = parseFloat(window.getComputedStyle(entry.el).fontSize) || pos.height;
      var h = Math.min(pos.height, fs * 0.9);
      fakeCaret.style.display = 'block';
      fakeCaret.style.visibility = 'visible';
      fakeCaret.style.height = h + 'px';
      fakeCaret.style.left = pos.left + 'px';
      fakeCaret.style.top = (pos.top + (pos.height - h) / 2) + 'px';
    } catch (fcErr) { fakeCaret.style.display = 'none'; }
  }
  function startFakeCaret(entry, color) {
    stopFakeCaret();
    try {
      fakeCaret = document.createElement('div');
      fakeCaret.setAttribute('data-orion-caret', '');
      fakeCaret.style.cssText = 'position:fixed;width:2px;margin-left:-1px;pointer-events:none;z-index:2147483647;display:none;background:' + color;
      document.documentElement.appendChild(fakeCaret);
      entry.el.style.caretColor = 'transparent';
      fakeCaretTimer = setInterval(function () {
        if (fakeCaret && fakeCaret.style.display === 'block') {
          fakeCaret.style.visibility = fakeCaret.style.visibility === 'hidden' ? 'visible' : 'hidden';
        }
      }, 530);
      fakeCaretOnMove = function () { updateFakeCaret(entry); };
      window.addEventListener('scroll', fakeCaretOnMove, true);
      window.addEventListener('resize', fakeCaretOnMove);
      updateFakeCaret(entry);
    } catch (fcErr) { stopFakeCaret(); }
  }
  function stopFakeCaret() {
    if (fakeCaretTimer) { clearInterval(fakeCaretTimer); fakeCaretTimer = null; }
    if (fakeCaretOnMove) {
      window.removeEventListener('scroll', fakeCaretOnMove, true);
      window.removeEventListener('resize', fakeCaretOnMove);
      fakeCaretOnMove = null;
    }
    if (fakeCaret && fakeCaret.parentNode) fakeCaret.parentNode.removeChild(fakeCaret);
    fakeCaret = null;
  }

  function tryStartInlineEdit(el, point) {
    if (inlineEdit || !editingActive) return false;
    if (!isSelectable(el)) return false;
    var role = detectRole(el);
    if (role !== 'heading' && role !== 'text' && role !== 'link' && role !== 'button') return false;
    var tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'option') return false;
    var snapshot = buildElementDescription(el);
    if (!snapshot.text || snapshot.textTruncated) return false;
    if (el.isContentEditable) return false;

    // Must be read before contentEditable turns the element into a host
    // (see stabilizeInlineHost).
    var hostWhiteSpace = '';
    try { hostWhiteSpace = window.getComputedStyle(el).whiteSpace || ''; } catch (wsErr) { hostWhiteSpace = ''; }
    var editTextRuns = [];
    if (hostWhiteSpace === 'normal' || hostWhiteSpace === 'nowrap') editTextRuns = collectEditingTextNodes(el);

    var entry = {
      el: el,
      snapshot: snapshot,
      startText: '',
      origHtml: el.innerHTML,
      origContentEditable: el.getAttribute('contenteditable'),
      origSpellcheck: el.getAttribute('spellcheck'),
      origWhiteSpace: el.style.whiteSpace,
      origCaretColor: el.style.caretColor,
      hostWhiteSpace: hostWhiteSpace,
      formatStyles: {},
      origInline: {},
      history: [],
      histIndex: 0,
      histTimer: null,
      onInput: null,
      savedRange: null,
      blurTimer: null,
      onBlur: null,
      onFocus: null,
      onSelectionChange: null,
      onDocPointerDown: null,
      onPaste: null
    };
    try { el.contentEditable = 'plaintext-only'; } catch (ceErr) { /* unsupported value */ }
    try {
      if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    } catch (ceErr2) { return false; }
    el.setAttribute('spellcheck', 'false');
    // Before focusing: the caret and hint chip should be placed against the
    // stabilized layout, not the pre-edit one.
    stabilizeInlineHost(el, hostWhiteSpace, editTextRuns);
    // After stabilizing: that collapses source newlines in normal-flow text
    // nodes, which inlineEditText would otherwise count as typed breaks.
    entry.startText = inlineEditText(el);
    var caretColor = chooseCaretColor(el);
    if (caretColor) el.style.caretColor = caretColor;
    try {
      el.focus({ preventScroll: true });
      var range = caretRangeAtPoint(el, point);
      if (!range) {
        range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
      }
      var sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
      entry.savedRange = range.cloneRange();
    } catch (focusErr) { /* no caret this round */ }
    try { startFakeCaret(entry, caretColor || window.getComputedStyle(el).color); } catch (fcErr) { /* native caret stays */ }
    paintInlineEdit(el);
    // Blur commits after a short grace period: a click on the parent's text
    // toolbar moves focus out of this frame, and the toolbar's hold message
    // (or focus coming straight back) must be able to cancel the commit.
    entry.onBlur = function () {
      if (entry.blurTimer) clearTimeout(entry.blurTimer);
      entry.blurTimer = setTimeout(function () {
        entry.blurTimer = null;
        if (inlineEdit !== entry || inlineHold) return;
        finishInlineEdit(true, false);
      }, 180);
    };
    entry.onFocus = function () {
      if (entry.blurTimer) { clearTimeout(entry.blurTimer); entry.blurTimer = null; }
    };
    entry.onInput = function () {
      updateFakeCaret(entry);
      if (entry.histTimer) clearTimeout(entry.histTimer);
      entry.histTimer = setTimeout(function () { entry.histTimer = null; recordInlineSnapshot(entry); }, 400);
    };
    entry.onSelectionChange = function () {
      try {
        var sel = window.getSelection();
        if (sel && sel.rangeCount && entry.el.contains(sel.anchorNode)) {
          entry.savedRange = sel.getRangeAt(0).cloneRange();
          var typo = readInlineTypography(entry);
          var typoJson = JSON.stringify(typo);
          if (typoJson !== entry.lastTypoJson) {
            entry.lastTypoJson = typoJson;
            post('inline-typography', typo);
          }
        }
      } catch (rangeErr) { /* keep the previous range */ }
      updateFakeCaret(entry);
    };
    // With the toolbar holding the session, a click back on the page ends the
    // hold: outside the element it commits (the blur already happened).
    entry.onDocPointerDown = function (e) {
      if (!inlineHold) return;
      inlineHold = false;
      if (!entry.el.contains(e.target)) finishInlineEdit(true, false);
    };
    entry.onPaste = function (e) {
      // Plain text only: the parent's engine swaps flat text, so rich
      // pasted markup would be discarded on apply anyway.
      e.preventDefault();
      e.stopPropagation();
      var text = '';
      try { text = (e.clipboardData && e.clipboardData.getData('text/plain')) || ''; } catch (cdErr) { text = ''; }
      if (text) {
        try { document.execCommand('insertText', false, text); } catch (execErr) { /* best effort */ }
      }
    };
    el.addEventListener('blur', entry.onBlur);
    el.addEventListener('focus', entry.onFocus);
    el.addEventListener('input', entry.onInput);
    el.addEventListener('paste', entry.onPaste, true);
    entry.history = [snapshotOf(entry)];
    document.addEventListener('selectionchange', entry.onSelectionChange);
    document.addEventListener('pointerdown', entry.onDocPointerDown, true);
    inlineEdit = entry;
    paintInlineEdit(el);
    var initTypo = readInlineTypography(entry);
    entry.lastTypoJson = JSON.stringify(initTypo);
    snapshot.typography = initTypo || snapshot.typography;
    post('inline-edit-started', snapshot);
    return true;
  }

`;
