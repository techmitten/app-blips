// Preview bridge source, part 9 of 17. The right-click insert menu.
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
export default `  // ------------------------------------------------------------------
  // Insert menu: a right-click while editing asks the parent for its menu
  // (add a text container or image, paste, and on text or an image: cut,
  // copy, duplicate, delete) instead of the browser's own. The spot is
  // resolved like a drop (resolveDrop with a stand-in paragraph that is
  // never in the page) and marked with the drag's insertion line while the
  // menu is open; the text or image under the pointer is outlined and
  // reported with it. This side only reports; the parent writes the change
  // into the source and the page reloads from it.
  // ------------------------------------------------------------------
  var insertLine = null;
  var insertSubject = null;
  var insertMenuOpen = false;
  // What the menu's Cut / Copy / Duplicate / Delete act on: text and images,
  // not the containers around them.
  var INSERT_SUBJECT_ROLES = { text: 1, heading: 1, image: 1 };

  function clearInsertSpot() {
    insertMenuOpen = false;
    if (insertLine && insertLine.parentNode) insertLine.parentNode.removeChild(insertLine);
    insertLine = null;
    if (insertSubject && !isPicked(insertSubject)) restoreOutline(insertSubject);
    insertSubject = null;
  }

  function containerAt(x, y) {
    var hit = null;
    try { hit = document.elementFromPoint(x, y); } catch (hitErr) { hit = null; }
    if (!hit || isBridgeNode(hit)) return null;
    var el = promoteToBlock(hit);
    return isMovable(el) ? el : null;
  }

  function insertSubjectAt(x, y) {
    var hit = null;
    try { hit = document.elementFromPoint(x, y); } catch (hitErr) { hit = null; }
    if (!hit || isBridgeNode(hit)) return null;
    var el = promoteToBlock(hit);
    return isMovable(el) && INSERT_SUBJECT_ROLES[detectRole(el)] ? el : null;
  }

  // The menu sits over the page; using the page again closes it.
  function dismissInsertMenu() {
    if (!insertMenuOpen) return;
    clearInsertSpot();
    post('insert-menu-dismissed', {});
  }

  function editOnContextMenu(e) {
    // Text being typed keeps the browser's own menu (spelling, paste).
    if (inlineEdit && inlineEdit.el.contains(e.target)) return;
    if (drag || marquee || pendingCommits.length) return;
    var subject = insertSubjectAt(e.clientX, e.clientY);
    if (!editingActive && !(imageContextMenuActive && subject && detectRole(subject) === 'image')) return;
    e.preventDefault();
    e.stopPropagation();
    clearInsertSpot();
    clearHover();
    var spot = null;
    try { spot = resolveDrop(e.clientX, e.clientY, document.createElement('p')); } catch (spotErr) { spot = null; }
    if (spot) {
      var lr = lineRect(spot);
      insertLine = dragChrome('z-index:2147483647;background:rgb(57,135,208);border-radius:2px;box-shadow:0 0 0 2px rgba(255,255,255,0.9);', 'line');
      placeBox(insertLine, lr.left, lr.top, lr.width, lr.height);
    }
    var area = subject ? null : containerAt(e.clientX, e.clientY);
    var subjectReport = subject ? buildElementDescription(subject) : null;
    // Outlined while the menu is open, so it's clear what Cut or Delete hits.
    if (subject && !isPicked(subject)) {
      paintHover(subject);
      insertSubject = subject;
    }
    insertMenuOpen = true;
    post('insert-menu', {
      x: e.clientX,
      y: e.clientY,
      viewportWidth: window.innerWidth || document.documentElement.clientWidth,
      spot: spot ? { target: describeLite(spot.el), position: spot.position } : null,
      element: subjectReport,
      // Off text and images: the block right-clicked (a card, a section),
      // so Ask AI can name the area by its source.
      container: area ? describeLite(area) : null,
      scroll: { x: window.pageXOffset || 0, y: window.pageYOffset || 0 }
    });
  }

  function insertOnPointerDown(e) {
    if (e.button === 2) return;
    dismissInsertMenu();
  }

`;
