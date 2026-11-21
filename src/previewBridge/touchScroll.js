// Preview bridge source, part 14 of 17. Section 3: the mobile touch-scroll simulation.
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
export default `  // ------------------------------------------------------------------
  // 3. Touch-scroll simulation
  // ------------------------------------------------------------------

  var SCROLLBAR_CSS =
    '* { scrollbar-width: none !important; -ms-overflow-style: none !important; } ' +
    '*::-webkit-scrollbar { display: none !important; }';

  var TOUCH_CSS =
    'html, body { touch-action: none !important; overscroll-behavior: none !important; }';

  function install() {
    var isDragging = false;
    var hasMoved = false;
    var startX = 0, startY = 0, lastX = 0, lastY = 0;
    var velocityX = 0, velocityY = 0;
    var momentumId = null;
    var suppressClick = false;
    var pointerCaptureTarget = null;
    var mainScrollEl = null;
    var startTarget = null;

    var scrollbarStyle = document.createElement('style');
    scrollbarStyle.textContent = SCROLLBAR_CSS;
    document.head.appendChild(scrollbarStyle);

    var touchStyle = document.createElement('style');
    touchStyle.textContent = TOUCH_CSS;
    document.head.appendChild(touchStyle);

    function findScrollableElement(target, isHorizontal) {
      var el = target;
      while (el && el !== document.documentElement && el !== document.body) {
        if (el.nodeType === 1) {
          var style = window.getComputedStyle(el);
          var overflow = isHorizontal
            ? (style.overflowX || '') + (style.overflow || '')
            : (style.overflowY || '') + (style.overflow || '');
          if (/(auto|scroll)/.test(overflow)) {
            var canScroll = isHorizontal
              ? el.scrollWidth > el.clientWidth + 1
              : el.scrollHeight > el.clientHeight + 1;
            if (canScroll) return el;
          }
        }
        el = el.parentElement;
      }
      return findGlobalScrollElement(isHorizontal);
    }

    function findGlobalScrollElement(isHorizontal) {
      var candidates = [document.scrollingElement, document.documentElement, document.body];
      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        if (el) {
          var canScroll = isHorizontal
            ? el.scrollWidth > el.clientWidth + 1
            : el.scrollHeight > el.clientHeight + 1;
          if (canScroll) return el;
        }
      }
      if (document.body) {
        var allScrollables = document.body.querySelectorAll('*');
        for (var j = 0; j < allScrollables.length; j++) {
          var child = allScrollables[j];
          var childStyle = window.getComputedStyle(child);
          var childOverflow = isHorizontal
            ? (childStyle.overflowX || '') + (childStyle.overflow || '')
            : (childStyle.overflowY || '') + (childStyle.overflow || '');
          if (/(auto|scroll)/.test(childOverflow)) {
            var canScrollChild = isHorizontal
              ? child.scrollWidth > child.clientWidth + 1
              : child.scrollHeight > child.clientHeight + 1;
            if (canScrollChild) return child;
          }
        }
      }
      return document.scrollingElement || document.documentElement || document.body;
    }

    function isFormControl(el) {
      // e.target can be the Document, which has no tagName.
      if (!el || !el.tagName) return false;
      var tag = el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'option') return true;
      if (el.isContentEditable) return true;
      return false;
    }

    function setUserSelect(value) {
      if (!document.body) return;
      document.body.style.userSelect = value;
      document.body.style.webkitUserSelect = value;
      document.body.style.MozUserSelect = value;
    }

    // Programmatic scrolling must be INSTANT. If the page (or scroller) sets
    // scroll-behavior: smooth -- common in generated websites, e.g. Tailwind's
    // scroll-smooth on <html> for anchor nav -- assigning scrollTop/scrollLeft
    // starts a smooth animation instead of moving immediately. The next move
    // reads the still-unmoved value back, subtracts from it, clamps at 0 and the
    // page never advances. Forcing auto around the assignment (inline style
    // overrides both the CSS rule and an inline smooth) makes the drag track the
    // pointer, then restores the page's own setting so anchor links stay smooth.
    function setScrollPosition(el, left, top) {
      if (!el) return;
      var prev = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto';
      el.scrollLeft = left;
      el.scrollTop = top;
      el.style.scrollBehavior = prev;
    }

    function onPointerDown(e) {
      if (momentumId) {
        cancelAnimationFrame(momentumId);
        momentumId = null;
      }
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (isFormControl(e.target)) return;
      // During a text session the gesture belongs to the editor (caret
      // placement and selection). Otherwise the picker still needs the page
      // to scroll: touch-action is none here, so without this a finger could
      // never reach the content below the fold while click-to-edit is on.
      // Taps stay taps (the 6px threshold below), so they reach editOnClick.
      if (editingActive && inlineEdit) return;
      // Drag mode moves elements with a mouse instead of scrolling the page.
      if (editingActive && dragModeActive && e.pointerType !== 'touch') return;
      // Shift+drag with a mouse draws click-to-edit's selection box instead.
      if (editingActive && e.shiftKey && e.pointerType === 'mouse') return;

      isDragging = true;
      hasMoved = false;
      suppressClick = false;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      velocityX = 0;
      velocityY = 0;
      startTarget = e.target;
      mainScrollEl = null;
      pointerCaptureTarget = null;
    }

    function onPointerMove(e) {
      if (!isDragging) return;

      var dx = e.clientX - startX;
      var dy = e.clientY - startY;

      // 6px drag threshold to prevent natural tap jitter from swallowing clicks
      if (!hasMoved && (dx * dx + dy * dy > 36)) {
        hasMoved = true;
        suppressClick = true;
        setUserSelect('none');

        var isHorizontal = Math.abs(dx) > Math.abs(dy);
        mainScrollEl = findScrollableElement(startTarget, isHorizontal);

        try {
          if (startTarget && startTarget.setPointerCapture) {
            startTarget.setPointerCapture(e.pointerId);
            pointerCaptureTarget = startTarget;
          }
        } catch (err) { /* not capturable */ }

        if (e.pointerType === 'mouse') {
          document.documentElement.style.cursor = 'grabbing';
        }
      }

      if (!hasMoved) return;

      var moveX = e.clientX - lastX;
      var moveY = e.clientY - lastY;

      velocityX = velocityX * 0.6 + moveX * 0.4;
      velocityY = velocityY * 0.6 + moveY * 0.4;

      if (mainScrollEl) {
        setScrollPosition(mainScrollEl, mainScrollEl.scrollLeft - moveX, mainScrollEl.scrollTop - moveY);
      }

      lastX = e.clientX;
      lastY = e.clientY;

      e.preventDefault();
    }

    function onPointerUp(e) {
      if (!isDragging) return;
      isDragging = false;

      try {
        if (pointerCaptureTarget && pointerCaptureTarget.releasePointerCapture) {
          pointerCaptureTarget.releasePointerCapture(e.pointerId);
        }
      } catch (err) { /* already released */ }
      pointerCaptureTarget = null;

      document.documentElement.style.cursor = 'grab';
      setUserSelect('');

      if (!hasMoved) {
        suppressClick = false;
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      var scrollTarget = mainScrollEl;
      if (scrollTarget && (Math.abs(velocityX) > 0.5 || Math.abs(velocityY) > 0.5)) {
        var applyMomentum = function () {
          if (Math.abs(velocityX) < 0.3 && Math.abs(velocityY) < 0.3) {
            momentumId = null;
            return;
          }

          velocityX *= 0.96;
          velocityY *= 0.96;

          setScrollPosition(scrollTarget, scrollTarget.scrollLeft - velocityX, scrollTarget.scrollTop - velocityY);

          momentumId = requestAnimationFrame(applyMomentum);
        };

        momentumId = requestAnimationFrame(applyMomentum);
      }
    }

    // Images and links are natively draggable with a mouse. Once that drag
    // starts the browser fires pointercancel, which ends the scroll gesture
    // mid-swipe, so pressing on a picture to scroll barely moves the page.
    // Touchscreens don't drag images, so neither does the simulation. An
    // explicit draggable="true" is the app's own drag and drop: left alone.
    function onDragStart(e) {
      if (editingActive) return;
      var t = e.target;
      if (t && t.nodeType !== 1) t = t.parentElement;
      if (t && t.closest && t.closest('[draggable="true"]')) return;
      e.preventDefault();
    }

    function onClick(e) {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      }
    }

    var opts = { capture: true, passive: false };

    document.addEventListener('pointerdown', onPointerDown, opts);
    document.addEventListener('pointermove', onPointerMove, opts);
    document.addEventListener('pointerup', onPointerUp, opts);
    document.addEventListener('pointercancel', onPointerUp, opts);
    document.addEventListener('click', onClick, true);
    document.addEventListener('dragstart', onDragStart, true);

    document.documentElement.style.cursor = 'grab';

    return function teardown() {
      document.removeEventListener('pointerdown', onPointerDown, opts);
      document.removeEventListener('pointermove', onPointerMove, opts);
      document.removeEventListener('pointerup', onPointerUp, opts);
      document.removeEventListener('pointercancel', onPointerUp, opts);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('dragstart', onDragStart, true);
      if (momentumId) cancelAnimationFrame(momentumId);
      if (scrollbarStyle.parentNode) scrollbarStyle.parentNode.removeChild(scrollbarStyle);
      if (touchStyle.parentNode) touchStyle.parentNode.removeChild(touchStyle);
      try {
        document.documentElement.style.cursor = '';
        setUserSelect('');
      } catch (err) { /* document going away */ }
    };
  }

`;
