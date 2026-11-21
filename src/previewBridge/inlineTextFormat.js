// Preview bridge source, part 4 of 17. In-place text editing: formatting from the parent's toolbar, source markup, session undo/redo and commits.
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
export default `  // --- In-place text editing -------------------------------------------
  //
  // The snapshot is taken BEFORE the user types: the parent's deterministic
  // engine anchors on the ORIGINAL text/outerHTML, so the committed payload
  // carries that snapshot untouched plus the new text. Reverting restores
  // the saved innerHTML string (live childNodes would have been mutated in
  // place by the typing itself).

  function restoreInlineEntry(entry) {
    try { entry.el.innerHTML = entry.origHtml; } catch (rErr) { /* element gone */ }
    // Live-previewed formatting goes back to the author's inline values.
    try {
      for (var prop in entry.origInline) {
        if (Object.prototype.hasOwnProperty.call(entry.origInline, prop)) entry.el.style[prop] = entry.origInline[prop];
      }
    } catch (fErr) { /* element gone */ }
  }

  // Text formatting from the parent's toolbar, previewed live on the editing
  // element and reported with the commit (the parent writes it to source).
  var FORMAT_PROPS = {
    fontFamily: 1, fontSize: 1, fontWeight: 1, fontStyle: 1,
    textDecorationLine: 1, textAlign: 1, textTransform: 1, color: 1
  };

  function refocusInline(entry) {
    try {
      entry.el.focus({ preventScroll: true });
      var sel = window.getSelection();
      if (sel && entry.savedRange) {
        sel.removeAllRanges();
        sel.addRange(entry.savedRange);
      }
    } catch (fErr) { /* no caret this round */ }
  }

  // Props that can apply to just the highlighted words; alignment only means
  // something on the block, so it always goes on the element.
  var RUN_PROPS = {
    fontFamily: 1, fontSize: 1, fontWeight: 1, fontStyle: 1,
    textDecorationLine: 1, textTransform: 1, color: 1
  };

  // The saved selection when it highlights only part of the text being
  // edited (not collapsed, not the whole thing); null means "format the
  // whole element", the long-standing behaviour.
  function partialSelectionRange(entry) {
    var range = entry.savedRange;
    try {
      if (!range || range.collapsed || !entry.el.contains(range.commonAncestorContainer)) return null;
      var all = document.createRange();
      all.selectNodeContents(entry.el);
      var coversAll = range.compareBoundaryPoints(Range.START_TO_START, all) <= 0
        && range.compareBoundaryPoints(Range.END_TO_END, all) >= 0;
      if (coversAll) return null;
      if (!String(range.toString()).replace(/\\s+/g, '')) return null;
      return range;
    } catch (rngErr) { return null; }
  }

  function readInlineTypography(entry) {
    if (!entry || !entry.el) return null;
    var base = readTypography(entry.el);
    if (!base) return null;
    try {
      var range = entry.savedRange;
      if (!range || !entry.el.contains(range.commonAncestorContainer)) return base;
      var node = range.startContainer;
      if (node === entry.el && range.startOffset < entry.el.childNodes.length) {
        node = entry.el.childNodes[range.startOffset];
      }
      if (node && node.nodeType !== 1) node = node.parentElement;
      if (!node || node === entry.el || !entry.el.contains(node)) return base;
      var runTypo = readTypography(node);
      if (!runTypo) return base;
      return {
        fontFamily: runTypo.fontFamily || base.fontFamily,
        fontSize: runTypo.fontSize || base.fontSize,
        fontWeight: runTypo.fontWeight || base.fontWeight,
        fontStyle: runTypo.fontStyle || base.fontStyle,
        underline: !!runTypo.underline,
        textAlign: base.textAlign,
        textTransform: runTypo.textTransform || base.textTransform,
        color: runTypo.color || base.color,
        display: base.display
      };
    } catch (rtErr) { return base; }
  }

  // Wraps the highlighted text in a styled span so only it changes. Styles
  // the new span overrides are cleared on what it swallows, or an inner
  // span's old color would win over the new one.
  function wrapSelectionWithStyles(entry, range, runStyles) {
    var existingFmt = null;
    try {
      if (range.startContainer === range.endContainer && range.startContainer.nodeType === 1 &&
          range.startContainer.hasAttribute && range.startContainer.hasAttribute('data-ab-fmt') &&
          range.startOffset === 0 && range.endOffset === range.startContainer.childNodes.length) {
        existingFmt = range.startContainer;
      } else {
        var anc = range.commonAncestorContainer;
        if (anc && anc.nodeType !== 1) anc = anc.parentElement;
        if (anc && anc.closest) {
          var fmtAnc = anc.closest('span[data-ab-fmt]');
          if (fmtAnc && entry.el.contains(fmtAnc) && fmtAnc.textContent === range.toString()) {
            existingFmt = fmtAnc;
          }
        }
      }
    } catch (exErr) { existingFmt = null; }

    if (existingFmt) {
      var existingInner = existingFmt.querySelectorAll ? existingFmt.querySelectorAll('*') : [];
      for (var ei = 0; ei < existingInner.length; ei++) {
        for (var ep in runStyles) {
          if (Object.prototype.hasOwnProperty.call(runStyles, ep)) existingInner[ei].style[ep] = '';
        }
      }
      for (var eprop in runStyles) {
        if (Object.prototype.hasOwnProperty.call(runStyles, eprop)) existingFmt.style[eprop] = runStyles[eprop];
      }
      var esel = window.getSelection();
      var enext = document.createRange();
      enext.selectNodeContents(existingFmt);
      if (esel) { esel.removeAllRanges(); esel.addRange(enext); }
      entry.savedRange = enext.cloneRange();
      return;
    }

    var span = document.createElement('span');
    span.setAttribute('data-ab-fmt', '');
    var frag = range.extractContents();
    var inner = frag.querySelectorAll ? frag.querySelectorAll('*') : [];
    for (var i = 0; i < inner.length; i++) {
      for (var p in runStyles) {
        if (Object.prototype.hasOwnProperty.call(runStyles, p)) inner[i].style[p] = '';
      }
    }
    for (var prop in runStyles) {
      if (Object.prototype.hasOwnProperty.call(runStyles, prop)) span.style[prop] = runStyles[prop];
    }
    span.appendChild(frag);
    range.insertNode(span);
    var sel = window.getSelection();
    var next = document.createRange();
    next.selectNodeContents(span);
    if (sel) { sel.removeAllRanges(); sel.addRange(next); }
    entry.savedRange = next.cloneRange();
  }

  function ensureBridgeFont(googleSpec) {
    if (!googleSpec || typeof googleSpec !== 'string' || !/^[A-Za-z0-9+:;@,._-]+$/.test(googleSpec)) return;
    try {
      var family = googleSpec.split(':')[0];
      var links = document.querySelectorAll('link[rel~="stylesheet"][href*="fonts.googleapis.com"]');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href') || '';
        if (href.indexOf('family=' + family) !== -1 || href.indexOf('family=' + family.replace(/\\+/g, '%20')) !== -1) return;
      }
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.crossOrigin = 'anonymous';
      link.href = 'https://fonts.googleapis.com/css2?family=' + googleSpec + '&display=swap';
      (document.head || document.documentElement).appendChild(link);
    } catch (fontErr) { /* falls back to system stack */ }
  }

  function applyInlineFormat(styles, fontGoogle) {
    var entry = inlineEdit;
    if (!entry || !styles || typeof styles !== 'object') return;
    if (fontGoogle) ensureBridgeFont(fontGoogle);
    var runStyles = {};
    var hasRun = false;
    var partial = partialSelectionRange(entry);
    for (var prop in styles) {
      if (!Object.prototype.hasOwnProperty.call(styles, prop) || !FORMAT_PROPS[prop]) continue;
      var value = String(styles[prop] == null ? '' : styles[prop]).slice(0, 200);
      if (!value || /[;{}<>]/.test(value)) continue;
      if (partial && RUN_PROPS[prop]) {
        runStyles[prop] = value;
        hasRun = true;
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(entry.origInline, prop)) entry.origInline[prop] = entry.el.style[prop];
      entry.el.style[prop] = value;
      entry.formatStyles[prop] = value;
    }
    if (hasRun) {
      try { wrapSelectionWithStyles(entry, partial, runStyles); } catch (wrapErr) { /* leave the text as it was */ }
    }
    recordInlineSnapshot(entry);
    refocusInline(entry);
    var typo = readInlineTypography(entry);
    entry.lastTypoJson = JSON.stringify(typo);
    post('inline-typography', typo);
  }

  function materializeLineBreaks(el, trimTrailing) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var texts = [];
    for (var n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n);
    if (trimTrailing && texts.length) {
      var last = texts[texts.length - 1];
      var trimmed = last.nodeValue.replace(/[\\r\\n]+$/, '');
      if (trimmed !== last.nodeValue) last.nodeValue = trimmed;
    }
    for (var t = 0; t < texts.length; t++) {
      var parts = texts[t].nodeValue.split(/\\r\\n?|\\n/);
      if (parts.length < 2) continue;
      var frag = document.createDocumentFragment();
      for (var q = 0; q < parts.length; q++) {
        if (q) frag.appendChild(document.createElement('br'));
        if (parts[q]) frag.appendChild(document.createTextNode(parts[q]));
      }
      texts[t].parentNode.replaceChild(frag, texts[t]);
    }
  }

  // The element's markup as it should be written to the source: bridge
  // attributes stripped, and newlines typed in the host as <br>.
  function inlineEditHtml(el) {
    var clone = withOriginalStyleAttrs(el, function () { return el.cloneNode(true); });
    var marked = clone.querySelectorAll('[data-ab-src],[data-ab-fmt]');
    for (var i = 0; i < marked.length; i++) {
      marked[i].removeAttribute('data-ab-src');
      marked[i].removeAttribute('data-ab-fmt');
    }
    materializeLineBreaks(clone, false);
    return clone.innerHTML;
  }

  function selectionOffsetsOf(el, range) {
    if (!range) return null;
    try {
      if (!el.contains(range.commonAncestorContainer)) return null;
      var pre = range.cloneRange();
      pre.selectNodeContents(el);
      pre.setEnd(range.startContainer, range.startOffset);
      var start = pre.toString().length;
      return { start: start, end: start + range.toString().length };
    } catch (soErr) { return null; }
  }

  function restoreSelectionOffsets(el, offsets) {
    if (!offsets || typeof offsets.start !== 'number' || typeof offsets.end !== 'number') return null;
    try {
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      var pos = 0;
      var startNode = null, startOff = 0, endNode = null, endOff = 0;
      for (var node = walker.nextNode(); node; node = walker.nextNode()) {
        var len = node.nodeValue.length;
        if (!startNode && offsets.start <= pos + len) {
          startNode = node;
          startOff = Math.max(0, offsets.start - pos);
        }
        if (!endNode && offsets.end <= pos + len) {
          endNode = node;
          endOff = Math.max(0, offsets.end - pos);
          break;
        }
        pos += len;
      }
      if (!startNode) return null;
      if (!endNode) { endNode = startNode; endOff = startNode.nodeValue.length; }
      var range = document.createRange();
      range.setStart(startNode, startOff);
      range.setEnd(endNode, endOff);
      return range;
    } catch (roErr) { return null; }
  }

  // Session undo/redo. The browser's own undo stack knows nothing about the
  // formatting previewed through element styles, so the session keeps its
  // own snapshots (markup + applied formatting): one after every format
  // change and one a moment after typing pauses.
  function snapshotOf(entry) {
    return {
      html: entry.el.innerHTML,
      fmt: JSON.stringify(entry.formatStyles),
      sel: selectionOffsetsOf(entry.el, entry.savedRange)
    };
  }

  function postInlineHistory(entry) {
    post('inline-history', { canUndo: entry.histIndex > 0, canRedo: entry.histIndex < entry.history.length - 1 });
  }

  function recordInlineSnapshot(entry) {
    if (entry.histTimer) { clearTimeout(entry.histTimer); entry.histTimer = null; }
    var snap = snapshotOf(entry);
    var top = entry.history[entry.histIndex];
    if (top && top.html === snap.html && top.fmt === snap.fmt) return;
    entry.history = entry.history.slice(0, entry.histIndex + 1);
    entry.history.push(snap);
    if (entry.history.length > 100) entry.history.shift();
    entry.histIndex = entry.history.length - 1;
    postInlineHistory(entry);
  }

  function stepInlineHistory(dir) {
    var entry = inlineEdit;
    if (!entry) return;
    recordInlineSnapshot(entry); // fold in typing that has not settled yet
    var next = entry.histIndex + dir;
    if (next < 0 || next >= entry.history.length) return;
    entry.histIndex = next;
    var snap = entry.history[next];
    entry.el.innerHTML = snap.html;
    var want = {};
    try { want = JSON.parse(snap.fmt); } catch (jErr) { want = {}; }
    var props = {};
    var k;
    for (k in entry.formatStyles) if (Object.prototype.hasOwnProperty.call(entry.formatStyles, k)) props[k] = 1;
    for (k in want) if (Object.prototype.hasOwnProperty.call(want, k)) props[k] = 1;
    for (k in props) {
      if (Object.prototype.hasOwnProperty.call(want, k)) {
        entry.el.style[k] = want[k];
        entry.formatStyles[k] = want[k];
      } else {
        entry.el.style[k] = Object.prototype.hasOwnProperty.call(entry.origInline, k) ? entry.origInline[k] : '';
        delete entry.formatStyles[k];
      }
    }
    try {
      entry.el.focus({ preventScroll: true });
      var range = restoreSelectionOffsets(entry.el, snap.sel);
      if (!range) {
        range = document.createRange();
        range.selectNodeContents(entry.el);
        range.collapse(false);
      }
      var sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      entry.savedRange = range.cloneRange();
    } catch (cErr) { /* no caret this round */ }
    postInlineHistory(entry);
    var typo = readInlineTypography(entry);
    entry.lastTypoJson = JSON.stringify(typo);
    post('inline-typography', typo);
  }

  function teardownInline(entry) {
    if (entry.blurTimer) { clearTimeout(entry.blurTimer); entry.blurTimer = null; }
    inlineHold = false;
    entry.el.removeEventListener('blur', entry.onBlur);
    entry.el.removeEventListener('focus', entry.onFocus);
    entry.el.removeEventListener('input', entry.onInput);
    if (entry.histTimer) { clearTimeout(entry.histTimer); entry.histTimer = null; }
    entry.el.removeEventListener('paste', entry.onPaste, true);
    document.removeEventListener('selectionchange', entry.onSelectionChange);
    document.removeEventListener('pointerdown', entry.onDocPointerDown, true);
    try {
      if (entry.origContentEditable != null) entry.el.setAttribute('contenteditable', entry.origContentEditable);
      else entry.el.removeAttribute('contenteditable');
    } catch (ceErr) { /* keep going */ }
    try {
      if (entry.origSpellcheck != null) entry.el.setAttribute('spellcheck', entry.origSpellcheck);
      else entry.el.removeAttribute('spellcheck');
    } catch (scErr) { /* keep going */ }
    try {
      // Undoes stabilizeInlineHost's pinned white-space ('' clears it).
      entry.el.style.whiteSpace = entry.origWhiteSpace || '';
    } catch (wsErr) { /* keep going */ }
    stopFakeCaret();
    try { entry.el.style.caretColor = entry.origCaretColor || ''; } catch (caretErr) { /* keep going */ }
    if (inlineEdit === entry) inlineEdit = null;
    if (editstyleElValid()) editStyleEl.textContent = editCursorCss();
    paintSelection(entry.el);
    post('inline-edit-ended', {});
  }

  function editstyleElValid() {
    return !!(editStyleEl && editingActive && !(drag && drag.active) && !(marquee && marquee.active));
  }

  // Walks the edit back out: original markup restored, nothing reported.
  function abortInlineEdit() {
    var entry = inlineEdit;
    if (!entry) return;
    teardownInline(entry);
    restoreInlineEntry(entry);
  }

  // An inline edit's text, with the user's typed line breaks kept as single
  // "\\n"s (blank lines too, capped at one) so the parent can write them back
  // as <br>. Only "\\n" characters inside text nodes count: that is what
  // Enter inserts in a plaintext-only host. Layout breaks (an existing <br>,
  // a block-level child) also show up as "\\n" in innerText but are already in
  // the source, so they collapse to spaces like any other whitespace, as
  // before; keeping them would add a stray <br> on every save. The typed ones
  // are swapped for a private-use sentinel while innerText is read.
  function inlineEditText(el) {
    var SENTINEL = '\\uE000';
    var touched = [];
    try {
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (var node = walker.nextNode(); node; node = walker.nextNode()) {
        if (/[\\r\\n]/.test(node.nodeValue)) {
          touched.push({ node: node, value: node.nodeValue });
          node.nodeValue = node.nodeValue.replace(/\\r\\n?|\\n/g, SENTINEL);
        }
      }
      return String(el.innerText || el.textContent || '')
        .replace(/\\s+/g, ' ')
        .split(SENTINEL)
        .map(function (line) { return line.trim(); })
        .join('\\n')
        .replace(/\\n{3,}/g, '\\n\\n')
        .trim();
    } catch (tErr) {
      return '';
    } finally {
      for (var i = 0; i < touched.length; i++) {
        try { touched[i].node.nodeValue = touched[i].value; } catch (rErr) { /* node gone */ }
      }
    }
  }

  // commit=true sends the change to the parent; false cancels (restore) and,
  // with openPanel, reports the element as selected so the parent's panel
  // (select-parent, Edit-with-AI) is reachable from a text element.
  function finishInlineEdit(commit, openPanel) {
    var entry = inlineEdit;
    if (!entry) return;
    if (!commit) {
      teardownInline(entry);
      restoreInlineEntry(entry);
      if (openPanel) {
        if (editSelectedEl && editSelectedEl !== entry.el) restoreOutline(editSelectedEl);
        editSelectedEl = entry.el;
        paintSelection(entry.el);
        syncResizeOverlay();
        describeElement(entry.el);
      } else {
        if (editSelectedEl === entry.el) editSelectedEl = null;
        restoreOutline(entry.el);
      }
      return;
    }
    var newText = inlineEditText(entry.el);
    var hasRuns = !!entry.el.querySelector('[data-ab-fmt]');
    var newInner = hasRuns ? inlineEditHtml(entry.el) : null;
    var fallbackInner = (newInner === null && entry.el.children && entry.el.children.length > 0)
      ? inlineEditHtml(entry.el)
      : null;
    teardownInline(entry);
    var hasFormat = Object.keys(entry.formatStyles).length > 0 || hasRuns;
    if (!newText) {
      restoreInlineEntry(entry);
      if (editSelectedEl === entry.el) editSelectedEl = null;
      restoreOutline(entry.el);
      return;
    }
    // Against the text as it was when editing began (same normalization),
    // not the fully collapsed snapshot, so adding or removing just a line
    // break still counts as a change.
    if (newText === entry.startText && !hasFormat) {
      if (editSelectedEl === entry.el) editSelectedEl = null;
      restoreOutline(entry.el);
      return;
    }
    // Turn typed line breaks into <br> so removing contentEditable leaves
    // the visual breaks intact without reloading the frame.
    if (!wsIsPreformatted(entry.hostWhiteSpace)) {
      if (newInner !== null) materializeLineBreaks(entry.el, false);
      else if (newText.indexOf('\\n') !== -1) materializeLineBreaks(entry.el, true);
    }

    var editId = ++inlineEditSequence;
    var pending = { id: editId, el: entry.el, origHtml: entry.origHtml, origInline: entry.origInline, timer: null };
    // If the parent never answers (bug, tab hidden forever, teardown race),
    // revert on our own so the frame cannot keep showing text the source
    // does not have.
    pending.timer = setTimeout(function () { resolveInlineEdit(false, editId); }, 3000);
    pendingCommits.push(pending);

    var payload = {};
    for (var k in entry.snapshot) {
      if (Object.prototype.hasOwnProperty.call(entry.snapshot, k)) payload[k] = entry.snapshot[k];
    }
    payload.newText = newText;
    payload.styles = entry.formatStyles;
    if (newInner !== null) payload.innerHtml = newInner;
    if (fallbackInner !== null) payload.fallbackInnerHtml = fallbackInner;
    payload.editId = editId;
    payload.scroll = { x: window.pageXOffset || 0, y: window.pageYOffset || 0 };
    post('element-text-committed', payload);
  }

  var SYNC_SKIP_TAGS = { HTML: 1, HEAD: 1, BODY: 1, SCRIPT: 1, STYLE: 1, META: 1, LINK: 1, TITLE: 1, BASE: 1, NOSCRIPT: 1 };

  function applySourceSync(el, sync) {
    if (!sync || typeof sync.fingerprint !== 'string') return;
    if (sync.shiftDelta && typeof sync.shiftFromId === 'number') {
      var updates = [];
      var nodes = document.querySelectorAll('[data-ab-src]');
      for (var i = 0; i < nodes.length; i++) {
        var raw = nodes[i].getAttribute('data-ab-src');
        if (!/^\\d+$/.test(raw)) continue;
        var id = parseInt(raw, 10);
        if (id >= sync.shiftFromId) updates.push([nodes[i], id + sync.shiftDelta]);
      }
      for (var u = 0; u < updates.length; u++) {
        updates[u][0].setAttribute('data-ab-src', String(updates[u][1]));
      }
    }
    if (Array.isArray(sync.innerIds) && el) {
      var kids = [];
      var all = el.querySelectorAll('*');
      for (var j = 0; j < all.length; j++) {
        var tag = String(all[j].tagName || '').toUpperCase();
        if (!SYNC_SKIP_TAGS[tag] && !isBridgeNode(all[j])) kids.push(all[j]);
      }
      if (kids.length === sync.innerIds.length) {
        for (var k = 0; k < kids.length; k++) {
          kids[k].setAttribute('data-ab-src', String(sync.innerIds[k]));
        }
      }
    }
    SOURCE_FP = sync.fingerprint;
    if (inlineEdit && inlineEdit.el !== el && inlineEdit.snapshot) {
      inlineEdit.snapshot.srcFingerprint = SOURCE_FP;
      inlineEdit.snapshot.srcId = sourceIdOf(inlineEdit.el);
    }
    if (editSelectedEl && editSelectedEl !== el && (!inlineEdit || inlineEdit.el !== editSelectedEl)) {
      if (document.body && document.body.contains(editSelectedEl)) {
        describeElement(editSelectedEl);
      }
    }
  }

  // Parent's verdict on a committed inline edit. The parent echoes editId,
  // so a failure restores exactly the right element even if the user has
  // already started another edit. Unknown ids are ignored: the entry was
  // already reverted by the timeout.
  function resolveInlineEdit(ok, editId, sourceSync) {
    var idx = -1;
    for (var i = 0; i < pendingCommits.length; i++) {
      if (pendingCommits[i].id === editId) { idx = i; break; }
    }
    if (idx === -1) return;
    var entry = pendingCommits.splice(idx, 1)[0];
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
    if (!ok) {
      restoreInlineEntry(entry);
      if (inlineEdit && inlineEdit.el !== entry.el) abortInlineEdit();
      if (editSelectedEl && editSelectedEl !== entry.el) restoreOutline(editSelectedEl);
      editSelectedEl = entry.el;
      paintSelection(entry.el);
      syncResizeOverlay();
      return;
    }
    try {
      var fmts = entry.el.querySelectorAll('[data-ab-fmt]');
      for (var f = 0; f < fmts.length; f++) fmts[f].removeAttribute('data-ab-fmt');
    } catch (fmtErr) { /* element gone */ }
    if (sourceSync) applySourceSync(entry.el, sourceSync);
    if (!(inlineEdit && inlineEdit.el === entry.el)) {
      if (editSelectedEl === entry.el) editSelectedEl = null;
      if (!isPicked(entry.el)) restoreOutline(entry.el);
    }
  }

`;
