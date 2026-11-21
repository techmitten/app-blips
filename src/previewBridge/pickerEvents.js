// Preview bridge source, part 6 of 17. Element picker events: hover, click, double-click and keyboard shortcuts while editing.
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
export default `  function editOnMouseOver(e) {
    // No hover outlines while a text session is live: the caret's own
    // focus outline is the only visual state that matters there.
    if (!editingActive || inlineEdit || (drag && drag.active) || (marquee && marquee.active) || dragSuppressClick) return;
    var el = e.target;
    if (el && el.ownerSVGElement) el = el.ownerSVGElement;
    if (!isSelectable(el)) return;
    // Drag mode outlines what a drag from here would move.
    if (dragModeActive) {
      el = editSelectedEl && editSelectedEl.contains(el) ? editSelectedEl : promoteToBlock(el);
      if (!isSelectable(el)) return;
    }
    if (el === editHoveredEl) return;
    clearHover();
    editHoveredEl = el;
    paintHover(el);
  }

  function editOnMouseOut(e) {
    if (!editingActive) return;
    // In drag mode the outlined element can be an ancestor of the one the
    // pointer leaves, so clear only when the pointer leaves the outline.
    if (dragModeActive) {
      if (editHoveredEl && !(e.relatedTarget && editHoveredEl.contains(e.relatedTarget))) clearHover();
      return;
    }
    if (e.target === editHoveredEl) clearHover();
  }

  // Nothing typed or formatted yet, so ending the session saves nothing.
  function inlineEditUntouched(entry) {
    return !entry.el.querySelector('[data-ab-fmt]') && !Object.keys(entry.formatStyles).length &&
      inlineEditText(entry.el) === entry.startText;
  }

  function editOnClick(e) {
    if (dragSuppressClick) {
      dragSuppressClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!editingActive) return;
    var el = e.target;
    if (el && el.ownerSVGElement) el = el.ownerSVGElement;
    if (inlineEdit) {
      // Clicks inside the live editor keep their default caret behavior;
      // stopPropagation only keeps page scripts out of the typing session.
      if (inlineEdit.el === el || inlineEdit.el.contains(el)) {
        e.stopPropagation();
        return;
      }
      // Clicks outside: commit the active inline edit immediately instead of
      // waiting for blur's 180ms timer (which only exists so clicks on the
      // parent's text toolbar can send inline-hold). When clicking another
      // selectable element, fall through so the user immediately switches
      // targets; when clicking background/body, consume the click as the save.
      if (!dragModeActive && !inlineHold) {
        var prevInlineEl = inlineEdit.el;
        finishInlineEdit(true, false);
        if (!isSelectable(el) || el === document.body || el === document.documentElement || el === prevInlineEl) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
    }
    if (!isSelectable(el)) return;
    // Capture phase + both stops: the page must not react to selection
    // clicks (no link navigation, no toggles) while picking.
    e.preventDefault();
    e.stopPropagation();
    clearHover();
    // Shift+click adds the element to the selection (or takes it out) instead
    // of editing it, so several elements can be picked one by one.
    if (e.shiftKey && !inlineEdit) {
      if (dragModeActive) {
        var picked = promoteToBlock(el);
        if (isSelectable(picked)) el = picked;
      }
      toggleInSelection(el);
      return;
    }
    // A plain click starts over from a single element.
    clearGroup();
    editChildStack = [];
    // Headings and plain text edit in place; everything else (images,
    // link/button URLs, section backgrounds) opens the parent's editor
    // panel. Links and buttons also edit in place -- via double-click.
    if (editSelectedEl && editSelectedEl !== el) restoreOutline(editSelectedEl);
    var role = detectRole(el);
    if (dragModeActive) {
      // Select what a drag would move (a paragraph, not a word in it).
      var block = promoteToBlock(el);
      if (isSelectable(block)) el = block;
    } else if ((role === 'heading' || role === 'text') && tryStartInlineEdit(el, { x: e.clientX, y: e.clientY })) {
      editSelectedEl = el;
      syncResizeOverlay();
      return;
    }
    editSelectedEl = el;
    paintSelection(el);
    syncResizeOverlay();
    describeElement(el);
  }

  // Links and buttons select on the first click (the panel owns their URL)
  // and edit their text in place on the second.
  function editOnDblClick(e) {
    if (!editingActive || dragModeActive || inlineEdit) return;
    var el = e.target;
    if (!isSelectable(el)) return;
    var role = detectRole(el);
    if (role !== 'link' && role !== 'button') return;
    e.preventDefault();
    e.stopPropagation();
    clearHover();
    tryStartInlineEdit(el, { x: e.clientX, y: e.clientY });
  }

  function editOnKeyDown(e) {
    if (!editingActive) return;
    if (resize && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      endResize(false);
      return;
    }
    if (drag && drag.active && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      endDrag(false);
      return;
    }
    if (marquee && marquee.active && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      endMarquee(false);
      return;
    }
    if (inlineEdit) {
      // While an IME composition is live, Enter/Escape belong to it.
      if (e.isComposing) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        var lower = String(e.key || '').toLowerCase();
        if (lower === 'z' || lower === 'y') {
          e.preventDefault();
          e.stopPropagation();
          stepInlineHistory(lower === 'y' || e.shiftKey ? 1 : -1);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finishInlineEdit(false, true);
        return;
      }
      // Plain Enter starts a new line (the host is plaintext-only, so the
      // browser inserts "\\n" and the commit turns it into <br>); Ctrl/Cmd+Enter
      // saves, as do Done and clicking elsewhere.
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        finishInlineEdit(true, false);
      }
      // Everything else belongs to the caret/IME.
      return;
    }
    if (e.key === 'Escape' && (editSelectedEl || editGroupEls.length)) {
      clearSelection(true);
      return;
    }
    // Structure shortcuts for the selected element, and undo/redo (the
    // parent's own shortcut cannot see keys while focus is in this frame).
    // The parent applies them to the source; this side only reports.
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
    var mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    var key = String(e.key || '');
    var lowerKey = key.toLowerCase();
    var action = null;
    if (mod && (lowerKey === 'z' || lowerKey === 'y')) {
      action = lowerKey === 'y' || e.shiftKey ? 'redo' : 'undo';
    } else if (editSelectedEl) {
      if ((key === 'Delete' || key === 'Backspace') && !e.ctrlKey && !e.metaKey && !e.altKey) action = 'delete';
      else if (mod && lowerKey === 'd') action = 'duplicate';
      else if (e.altKey && !e.ctrlKey && !e.metaKey && key === 'ArrowUp') action = 'move-up';
      else if (e.altKey && !e.ctrlKey && !e.metaKey && key === 'ArrowDown') action = 'move-down';
    } else if (editGroupEls.length) {
      // A group can only be deleted together; the other keys need one element.
      if ((key === 'Delete' || key === 'Backspace') && !e.ctrlKey && !e.metaKey && !e.altKey) action = 'delete';
    }
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    post('element-shortcut', { action: action });
  }

`;
