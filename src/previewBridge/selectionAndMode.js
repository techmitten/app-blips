// Preview bridge source, part 11 of 17. Selecting parent/child, clearing the selection, and turning editing and drag mode on and off.
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
export default `  function editSelectParent(steps) {
    if (!editingActive) return;
    var current = inlineEdit ? inlineEdit.el : editSelectedEl;
    if (!current) return;
    if (inlineEdit) {
      if (inlineEditUntouched(inlineEdit)) abortInlineEdit();
      else finishInlineEdit(true, false);
    }
    var count = typeof steps === 'number' && steps > 1 ? Math.min(10, Math.floor(steps)) : 1;
    var target = current;
    var pushed = [];
    for (var s = 0; s < count; s++) {
      var nextParent = target.parentElement;
      if (!nextParent || nextParent === document.documentElement) break;
      pushed.push(target);
      target = nextParent;
    }
    if (target === current) return;
    for (var pIdx = 0; pIdx < pushed.length; pIdx++) {
      editChildStack.push(pushed[pIdx]);
    }
    clearHover();
    if (editSelectedEl) restoreOutline(editSelectedEl);
    editSelectedEl = target;
    paintSelection(target);
    syncResizeOverlay();
    describeElement(target);
  }

  function editSelectChild(steps) {
    if (!editingActive || !editSelectedEl || !editChildStack.length) return;
    if (inlineEdit) {
      if (inlineEditUntouched(inlineEdit)) abortInlineEdit();
      else finishInlineEdit(true, false);
    }
    var count = typeof steps === 'number' && steps > 1 ? Math.min(editChildStack.length, Math.floor(steps)) : 1;
    var child = null;
    for (var s = 0; s < count && editChildStack.length > 0; s++) {
      var candidate = editChildStack.pop();
      if (candidate && document.body && document.body.contains(candidate)) {
        child = candidate;
      }
    }
    while (!child && editChildStack.length > 0) {
      var fallback = editChildStack.pop();
      if (fallback && document.body && document.body.contains(fallback)) {
        child = fallback;
      }
    }
    if (!child) {
      describeElement(editSelectedEl);
      return;
    }
    clearHover();
    if (editSelectedEl) restoreOutline(editSelectedEl);
    editSelectedEl = child;
    paintSelection(child);
    syncResizeOverlay();
    describeElement(child);
  }

  function editStartSelectedInline() {
    if (!editingActive || dragModeActive || inlineEdit || !editSelectedEl) return;
    tryStartInlineEdit(editSelectedEl, null);
  }

  function clearSelection(notify) {
    endResize(false);
    abortInlineEdit();
    clearHover();
    if (editSelectedEl) restoreOutline(editSelectedEl);
    editSelectedEl = null;
    editChildStack = [];
    clearGroup();
    hideResizeOverlay();
    hideStateBadge();
    if (notify) post('element-deselected', {});
  }

  // Entering or leaving drag mode keeps the selection (a container picked
  // with select-parent can be dragged next). A live text session is
  // committed rather than dropped: the click on the parent's toggle has
  // already blurred it, which is a commit anyway.
  function setDragMode(on) {
    if (on === dragModeActive) return;
    endResize(false);
    endDrag(false);
    endMarquee(false);
    if (inlineEdit) finishInlineEdit(true, false);
    clearHover();
    dragModeActive = on;
    if (editStyleEl) editStyleEl.textContent = editCursorCss();
    syncResizeOverlay();
    syncStateBadge();
  }

  function setEditingEnabled(enabled, dragOn, lockOn, imageMenuOn) {
    containerLockActive = !!enabled && !!lockOn;
    imageContextMenuActive = !!imageMenuOn;
    if (!!enabled === editingActive) {
      setDragMode(!!enabled && !!dragOn);
      return;
    }
    endResize(false);
    endDrag(false);
    endMarquee(false);
    clearInsertSpot();
    editingActive = !!enabled;
    dragModeActive = editingActive && !!dragOn;
    abortInlineEdit();
    clearHover();
    clearSelection(false);
    hideResizeOverlay();
    hideStateBadge();
    if (editingActive) {
      if (!editStyleEl) {
        editStyleEl = document.createElement('style');
        editStyleEl.setAttribute('data-orion-bridge', 'true');
        (document.head || document.documentElement).appendChild(editStyleEl);
      }
      editStyleEl.textContent = editCursorCss();
    } else if (editStyleEl) {
      if (editStyleEl.parentNode) editStyleEl.parentNode.removeChild(editStyleEl);
      editStyleEl = null;
    }
  }

  document.addEventListener('mouseover', editOnMouseOver, true);
  document.addEventListener('mouseout', editOnMouseOut, true);
  document.addEventListener('click', editOnClick, true);
  document.addEventListener('dblclick', editOnDblClick, true);
  document.addEventListener('keydown', editOnKeyDown, true);
  document.addEventListener('pointerdown', resizeOnPointerDown, true);
  document.addEventListener('pointermove', resizeOnPointerMove, true);
  document.addEventListener('pointerup', resizeOnPointerUp, true);
  document.addEventListener('pointercancel', resizeOnPointerCancel, true);
  document.addEventListener('pointerdown', dragOnPointerDown, true);
  document.addEventListener('pointermove', dragOnPointerMove, true);
  document.addEventListener('pointerup', dragOnPointerUp, true);
  document.addEventListener('pointercancel', dragOnPointerCancel, true);
  document.addEventListener('pointerdown', marqueeOnPointerDown, true);
  document.addEventListener('pointermove', marqueeOnPointerMove, true);
  document.addEventListener('pointerup', marqueeOnPointerUp, true);
  document.addEventListener('pointercancel', marqueeOnPointerCancel, true);
  document.addEventListener('dragstart', dragOnNativeDragStart, true);
  document.addEventListener('contextmenu', editOnContextMenu, true);
  document.addEventListener('pointerdown', insertOnPointerDown, true);
  // The line is fixed to the viewport; scrolling would leave it behind.
  window.addEventListener('scroll', function () { dismissInsertMenu(); syncResizeOverlay(); syncStateBadge(); }, true);
  window.addEventListener('resize', function () { syncResizeOverlay(); syncStateBadge(); });

`;
