// Preview bridge source, part 10 of 17. Image resize handles and growing the image's containers.
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
export default `  // --- Image resize handles ------------------------------------------------
  var RESIZE_HANDLES = [
    { dir: 'nw', left: '0%', top: '0%', cursor: 'nwse-resize', sizeCss: 'width:10px;height:10px;margin:0;border-radius:2px;border:2px solid rgb(57,135,208);' },
    { dir: 'n', left: '50%', top: '0%', cursor: 'ns-resize', sizeCss: 'width:16px;height:6px;margin:0 0 0 -8px;border-radius:999px;border:1.5px solid rgb(57,135,208);' },
    { dir: 'ne', left: '100%', top: '0%', cursor: 'nesw-resize', sizeCss: 'width:10px;height:10px;margin:0 0 0 -10px;border-radius:2px;border:2px solid rgb(57,135,208);' },
    { dir: 'e', left: '100%', top: '50%', cursor: 'ew-resize', sizeCss: 'width:6px;height:16px;margin:-8px 0 0 -6px;border-radius:999px;border:1.5px solid rgb(57,135,208);' },
    { dir: 'se', left: '100%', top: '100%', cursor: 'nwse-resize', sizeCss: 'width:10px;height:10px;margin:-10px 0 0 -10px;border-radius:2px;border:2px solid rgb(57,135,208);' },
    { dir: 's', left: '50%', top: '100%', cursor: 'ns-resize', sizeCss: 'width:16px;height:6px;margin:-6px 0 0 -8px;border-radius:999px;border:1.5px solid rgb(57,135,208);' },
    { dir: 'sw', left: '0%', top: '100%', cursor: 'nesw-resize', sizeCss: 'width:10px;height:10px;margin:-10px 0 0 0;border-radius:2px;border:2px solid rgb(57,135,208);' },
    { dir: 'w', left: '0%', top: '50%', cursor: 'ew-resize', sizeCss: 'width:6px;height:16px;margin:-8px 0 0 0;border-radius:999px;border:1.5px solid rgb(57,135,208);' }
  ];
  var resizeOverlay = null;
  var resizeBadge = null;
  var resize = null;

  function isResizeHandle(node) {
    return !!(node && node.getAttribute && node.getAttribute('data-orion-resize-handle'));
  }

  function hideResizeOverlay() {
    if (resizeOverlay && resizeOverlay.parentNode) resizeOverlay.parentNode.removeChild(resizeOverlay);
    resizeOverlay = null;
    if (resizeBadge && resizeBadge.parentNode) resizeBadge.parentNode.removeChild(resizeBadge);
    resizeBadge = null;
  }

  function ensureResizeOverlay() {
    if (resizeOverlay && resizeOverlay.parentNode) return resizeOverlay;
    var box = document.createElement('div');
    box.setAttribute('data-orion-bridge', 'true');
    box.setAttribute('data-orion-resize-box', 'true');
    box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;box-sizing:border-box;margin:0;';
    for (var i = 0; i < RESIZE_HANDLES.length; i++) {
      var h = RESIZE_HANDLES[i];
      var handle = document.createElement('div');
      handle.setAttribute('data-orion-bridge', 'true');
      handle.setAttribute('data-orion-resize-handle', h.dir);
      handle.style.cssText = 'position:absolute;left:' + h.left + ';top:' + h.top + ';' + h.sizeCss +
        'background:#fff;box-shadow:0 1px 3px rgba(15,23,42,0.35);pointer-events:auto;touch-action:none;box-sizing:border-box;' +
        'cursor:' + h.cursor + ' !important;';
      box.appendChild(handle);
    }
    document.documentElement.appendChild(box);
    resizeOverlay = box;
    return box;
  }

  function syncResizeOverlay() {
    var activeEl = resize ? resize.el : editSelectedEl;
    if (!editingActive || dragModeActive || inlineEdit || editGroupEls.length || !activeEl ||
        detectRole(activeEl) !== 'image' || !document.body || !document.body.contains(activeEl)) {
      if (!resize) hideResizeOverlay();
      return;
    }
    var r;
    try { r = activeEl.getBoundingClientRect(); } catch (rectErr) { hideResizeOverlay(); return; }
    if (!r || r.width < 4 || r.height < 4) { hideResizeOverlay(); return; }
    var box = ensureResizeOverlay();
    placeBox(box, r.left, r.top, r.width, r.height);
    var showEdges = r.width >= 44 && r.height >= 44;
    var showAllCorners = r.width >= 20 && r.height >= 20;
    var kids = box.children;
    for (var i = 0; i < kids.length; i++) {
      var dir = kids[i].getAttribute('data-orion-resize-handle');
      var isEdge = dir === 'n' || dir === 'e' || dir === 's' || dir === 'w';
      if (isEdge) kids[i].style.display = showEdges ? 'block' : 'none';
      else kids[i].style.display = showAllCorners || dir === 'se' ? 'block' : 'none';
    }
  }

  function updateResizeBadge(rect) {
    if (!resizeBadge) {
      resizeBadge = document.createElement('div');
      resizeBadge.setAttribute('data-orion-bridge', 'true');
      resizeBadge.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;padding:2px 7px;border-radius:5px;' +
        'background:rgba(15,23,42,0.88);color:#fff;font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;' +
        'box-shadow:0 2px 8px rgba(0,0,0,0.28);white-space:nowrap;';
      document.documentElement.appendChild(resizeBadge);
    }
    resizeBadge.textContent = Math.round(rect.width) + ' × ' + Math.round(rect.height);
    var vw = window.innerWidth || document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var bw = resizeBadge.offsetWidth || 72;
    var bh = resizeBadge.offsetHeight || 20;
    var left = Math.max(6, Math.min(rect.right - bw, vw - bw - 6));
    var top = rect.bottom + 8 + bh <= vh ? rect.bottom + 8 : Math.max(6, rect.top - bh - 8);
    resizeBadge.style.left = left + 'px';
    resizeBadge.style.top = top + 'px';
  }

  function readCleanStyleAttr(el) {
    var saved = el.__orionOutlineSaved;
    if (saved) {
      el.style.outline = saved.outline;
      el.style.outlineOffset = saved.offset;
    }
    var attr = el.getAttribute('style');
    if (saved) {
      el.style.outline = EDIT_SELECT_OUTLINE;
      el.style.outlineOffset = '1px';
    }
    return attr;
  }

  function restoreElStyleAttr(el, styleAttr) {
    var wasPicked = isPicked(el);
    if (wasPicked) restoreOutline(el);
    if (styleAttr == null) el.removeAttribute('style');
    else el.setAttribute('style', styleAttr);
    if (wasPicked) paintSelection(el);
  }

  function restoreTouchedContainers(list) {
    if (!list) return;
    for (var i = list.length - 1; i >= 0; i--) {
      var item = list[i];
      if (!item || !item.el) continue;
      if (item.origStyleAttr == null) item.el.removeAttribute('style');
      else item.el.setAttribute('style', item.origStyleAttr);
    }
  }

  var CORNER_PROPS = [
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomRightRadius',
    'borderBottomLeftRadius'
  ];

  function parseCornerPair(raw, w, h) {
    var parts = String(raw || '0px').trim().split(' ');
    var hTok = parts[0] || '0px';
    var vTok = parts[1] || hTok;
    var hPct = hTok.indexOf('%') !== -1;
    var vPct = vTok.indexOf('%') !== -1;
    var rx = hPct ? (parseFloat(hTok) || 0) * w / 100 : (parseFloat(hTok) || 0);
    var ry = vPct ? (parseFloat(vTok) || 0) * h / 100 : (parseFloat(vTok) || 0);
    return { rx: Math.max(0, rx), ry: Math.max(0, ry), hasPct: hPct || vPct };
  }

  function formatCornerPx(rx, ry) {
    var x = Math.round(rx * 10) / 10;
    var y = Math.round(ry * 10) / 10;
    if (Math.abs(x - y) < 0.05) return x + 'px';
    return x + 'px ' + y + 'px';
  }

  function snapshotAncestorCorners(el) {
    var snaps = [];
    var node = el.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      var cs;
      try { cs = window.getComputedStyle(node); } catch (csErr) { cs = null; }
      if (!cs || cs.display === 'inline' || cs.display === 'contents') {
        node = node.parentElement;
        continue;
      }
      var rect = node.getBoundingClientRect();
      var pairs = [];
      var anyPct = false;
      for (var i = 0; i < CORNER_PROPS.length; i++) {
        var pair = parseCornerPair(cs[CORNER_PROPS[i]], rect.width, rect.height);
        if (pair.hasPct) anyPct = true;
        pairs.push(pair);
      }
      var cornerInfo = null;
      if (anyPct && rect.width > 0 && rect.height > 0) {
        var sumTop = pairs[0].rx + pairs[1].rx;
        var sumBot = pairs[3].rx + pairs[2].rx;
        var sumLeft = pairs[0].ry + pairs[3].ry;
        var sumRight = pairs[1].ry + pairs[2].ry;
        var f = 1;
        if (sumTop > rect.width && sumTop > 0) f = Math.min(f, rect.width / sumTop);
        if (sumBot > rect.width && sumBot > 0) f = Math.min(f, rect.width / sumBot);
        if (sumLeft > rect.height && sumLeft > 0) f = Math.min(f, rect.height / sumLeft);
        if (sumRight > rect.height && sumRight > 0) f = Math.min(f, rect.height / sumRight);
        var resolved = [];
        var allFull = true;
        for (var j = 0; j < pairs.length; j++) {
          var rx0 = pairs[j].rx * f;
          var ry0 = pairs[j].ry * f;
          if (rx0 < rect.width / 2 - 0.5 || ry0 < rect.height / 2 - 0.5) allFull = false;
          resolved.push({ rx: rx0, ry: ry0, hasPct: pairs[j].hasPct });
        }
        cornerInfo = { allFull: allFull, resolved: resolved };
      }
      snaps.push({
        el: node,
        origW: rect.width,
        origH: rect.height,
        origAspectRatio: cs.aspectRatio,
        cornerInfo: cornerInfo
      });
      node = node.parentElement;
    }
    return snaps;
  }

  function preserveContainerCornerStyles(snap, newW, newH) {
    if (!snap || !snap.cornerInfo) return null;
    if (newW <= snap.origW + 0.5 && newH <= snap.origH + 0.5) return null;
    var info = snap.cornerInfo;
    if (info.allFull) {
      var wasCircle = Math.abs(snap.origW - snap.origH) <= 1.5;
      if (wasCircle) {
        if (Math.abs(newW - newH) <= 1.5) return null;
        return { borderRadius: '9999px' };
      }
      if (snap.origH > 0 && newH > 0 && Math.abs((newW / newH) - (snap.origW / snap.origH)) <= 0.02) {
        return null;
      }
    }
    var out = {};
    var firstVal = null;
    var allSame = true;
    for (var i = 0; i < CORNER_PROPS.length; i++) {
      var r = info.resolved[i];
      var formatted = formatCornerPx(r.rx, r.ry);
      if (firstVal === null) firstVal = formatted;
      else if (formatted !== firstVal) allSame = false;
      if (r.hasPct) out[CORNER_PROPS[i]] = formatted;
    }
    if (allSame && Object.keys(out).length === 4) {
      return { borderRadius: firstVal };
    }
    return Object.keys(out).length ? out : null;
  }

  var OVERLAY_POSITIONS = { absolute: 1, fixed: 1 };
  var IGNORED_SIBLING_TAGS = { SCRIPT: 1, STYLE: 1, TEMPLATE: 1, SOURCE: 1, TRACK: 1 };

  function directChildFor(node, desc) {
    var cur = desc;
    while (cur && cur.parentElement !== node) {
      cur = cur.parentElement;
    }
    return cur;
  }

  function isSingleImageContainer(node, childBranch) {
    if (!childBranch) return false;
    var children = node.childNodes;
    for (var i = 0; i < children.length; i++) {
      var ch = children[i];
      if (ch === childBranch) continue;
      if (ch.nodeType === 3) {
        if (String(ch.nodeValue || '').trim()) return false;
        continue;
      }
      if (ch.nodeType !== 1) continue;
      if (isBridgeNode(ch)) continue;
      if (IGNORED_SIBLING_TAGS[upperTag(ch)]) continue;
      var chCs;
      try { chCs = window.getComputedStyle(ch); } catch (csErr) { chCs = null; }
      if (chCs && (chCs.display === 'none' || OVERLAY_POSITIONS[chCs.position])) continue;
      return false;
    }
    return true;
  }

  // Expands enclosing containers whenever the image grows past what their
  // width/height, max-width/max-height, aspect-ratio or flex constraints allow,
  // and shrinks single-image containers to hug the image when container lock is on.
  function applyImageSizeAndContainers(el, opts) {
    var nextW = opts.nextW;
    var nextH = opts.nextH;
    var startW = opts.startW;
    var startH = opts.startH;
    var explicitGrowW = nextW != null && nextW > startW;
    var explicitGrowH = nextH != null && nextH > startH;
    var explicitShrinkW = containerLockActive && nextW != null && nextW < startW;
    var explicitShrinkH = containerLockActive && nextH != null && nextH < startH;
    var origMaxW = el.style.maxWidth;
    var origMaxH = el.style.maxHeight;
    var origFlexShrink = el.style.flexShrink;
    var ancestorSnaps = (explicitGrowW || explicitGrowH || explicitShrinkW || explicitShrinkH)
      ? snapshotAncestorCorners(el)
      : [];

    if (nextW != null) el.style.width = Math.round(nextW) + 'px';
    if (nextH != null) el.style.height = Math.round(nextH) + 'px';
    if (nextW != null && nextH != null && el.style.aspectRatio) el.style.aspectRatio = '';

    if (explicitGrowW || explicitGrowH) {
      el.style.maxWidth = 'none';
      el.style.flexShrink = '0';
      el.style.maxHeight = 'none';
    }

    var elRectAfter = el.getBoundingClientRect();
    var growW = explicitGrowW || (nextW == null && explicitGrowH && elRectAfter.width > startW + 0.5);
    var growH = explicitGrowH || (nextH == null && explicitGrowW && elRectAfter.height > startH + 0.5);
    var shrinkW = explicitShrinkW || (containerLockActive && nextW == null && explicitShrinkH && elRectAfter.width < startW - 0.5);
    var shrinkH = explicitShrinkH || (containerLockActive && nextH == null && explicitShrinkW && elRectAfter.height < startH - 0.5);
    var targetW = nextW != null ? Math.round(nextW) : Math.ceil(elRectAfter.width);
    var targetH = nextH != null ? Math.round(nextH) : Math.ceil(elRectAfter.height);

    var touched = [];
    var shrinkChainOpen = shrinkW || shrinkH;
    if (growW || growH || shrinkW || shrinkH) {
      for (var sIdx = 0; sIdx < ancestorSnaps.length; sIdx++) {
        var snap = ancestorSnaps[sIdx];
        var node = snap.el;
        var cs;
        try { cs = window.getComputedStyle(node); } catch (csErr) { cs = null; }
        if (!cs || cs.display === 'inline' || cs.display === 'contents') continue;
        var cRect = node.getBoundingClientRect();
        var elRect = el.getBoundingClientRect();
        var padL = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.borderLeftWidth) || 0);
        var padR = (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderRightWidth) || 0);
        var padT = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.borderTopWidth) || 0);
        var padB = (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
        var innerW = Math.max(0, cRect.width - padL - padR);
        var innerH = Math.max(0, cRect.height - padT - padB);
        var cStyles = {};

        var childBranch = shrinkChainOpen ? directChildFor(node, el) : null;
        if (shrinkChainOpen && !isSingleImageContainer(node, childBranch)) {
          shrinkChainOpen = false;
        }
        var shrinkTargetW = null;
        var shrinkTargetH = null;
        var shrinkNeededW = null;
        var shrinkNeededH = null;
        if (shrinkChainOpen) {
          var childRect = childBranch === el ? elRect : childBranch.getBoundingClientRect();
          var childW = childBranch === el ? targetW : Math.ceil(childRect.width);
          var childH = childBranch === el ? targetH : Math.ceil(childRect.height);
          if (shrinkW && childW < innerW - 0.5) {
            shrinkNeededW = Math.max(1, childW + padL + padR);
            shrinkTargetW = cs.boxSizing === 'border-box' ? Math.ceil(shrinkNeededW) : Math.max(1, childW);
            cStyles.width = shrinkTargetW + 'px';
            if ((parseFloat(cs.minWidth) || 0) > shrinkTargetW - 0.5) cStyles.minWidth = '0px';
          }
          if (shrinkH && childH < innerH - 0.5) {
            shrinkNeededH = Math.max(1, childH + padT + padB);
            shrinkTargetH = cs.boxSizing === 'border-box' ? Math.ceil(shrinkNeededH) : Math.max(1, childH);
            cStyles.height = shrinkTargetH + 'px';
            if ((parseFloat(cs.minHeight) || 0) > shrinkTargetH - 0.5) cStyles.minHeight = '0px';
          }
        }

        if (growW) {
          var wantW = targetW;
          var overRight = elRect.right - (cRect.right - padR);
          var overLeft = (cRect.left + padL) - elRect.left;
          var canExpandScrollX = cs.overflowX !== 'auto' && cs.overflowX !== 'scroll';
          var overScrollX = canExpandScrollX && node.scrollWidth > node.clientWidth + 1
            ? node.scrollWidth - node.clientWidth
            : 0;
          if (wantW > innerW + 0.5 || overRight > 0.5 || overLeft > 0.5 || overScrollX > 1) {
            var neededW = Math.ceil(Math.max(
              cRect.width + Math.max(0, wantW - innerW),
              cRect.width + Math.max(0, overRight) + Math.max(0, overLeft),
              cRect.width + overScrollX
            ));
            var cssW = cs.boxSizing === 'border-box' ? neededW : Math.max(1, neededW - padL - padR);
            cStyles.minWidth = cssW + 'px';
            if (cs.maxWidth && cs.maxWidth !== 'none') cStyles.maxWidth = 'none';
          }
        }

        if (growH) {
          var wantH = targetH;
          var overBottom = elRect.bottom - (cRect.bottom - padB);
          var overTop = (cRect.top + padT) - elRect.top;
          var canExpandScrollY = cs.overflowY !== 'auto' && cs.overflowY !== 'scroll';
          var overScrollY = canExpandScrollY && node.scrollHeight > node.clientHeight + 1
            ? node.scrollHeight - node.clientHeight
            : 0;
          if (wantH > innerH + 0.5 || overBottom > 0.5 || overTop > 0.5 || overScrollY > 1) {
            var neededH = Math.ceil(Math.max(
              cRect.height + Math.max(0, wantH - innerH),
              cRect.height + Math.max(0, overBottom) + Math.max(0, overTop),
              cRect.height + overScrollY
            ));
            var cssH = cs.boxSizing === 'border-box' ? neededH : Math.max(1, neededH - padT - padB);
            cStyles.minHeight = cssH + 'px';
            if (cs.height && cs.height !== 'auto') cStyles.height = 'auto';
            if (cs.maxHeight && cs.maxHeight !== 'none') cStyles.maxHeight = 'none';
          }
        }

        var changedW = !!(cStyles.minWidth || cStyles.width);
        var changedH = !!(cStyles.minHeight || cStyles.height);
        if ((changedW || changedH) && snap.origAspectRatio && snap.origAspectRatio !== 'auto') {
          cStyles.aspectRatio = 'auto';
          if (changedW && !changedH) {
            var keepH = cs.boxSizing === 'border-box' ? Math.ceil(snap.origH) : Math.max(1, Math.ceil(snap.origH - padT - padB));
            cStyles.height = keepH + 'px';
          } else if (changedH && !changedW) {
            var keepW = cs.boxSizing === 'border-box' ? Math.ceil(snap.origW) : Math.max(1, Math.ceil(snap.origW - padL - padR));
            cStyles.width = keepW + 'px';
          }
        }

        var cOrigStyle = node.getAttribute('style');
        var cSnap = buildElementDescription(node);
        for (var sp in cStyles) {
          if (Object.prototype.hasOwnProperty.call(cStyles, sp)) node.style[sp] = cStyles[sp];
        }

        var afterRect = node.getBoundingClientRect();
        if (shrinkTargetW !== null && afterRect.width > shrinkNeededW + 0.5) {
          node.style.maxWidth = shrinkTargetW + 'px';
          cStyles.maxWidth = shrinkTargetW + 'px';
          afterRect = node.getBoundingClientRect();
        }
        if (shrinkTargetH !== null && afterRect.height > shrinkNeededH + 0.5) {
          node.style.maxHeight = shrinkTargetH + 'px';
          cStyles.maxHeight = shrinkTargetH + 'px';
          afterRect = node.getBoundingClientRect();
        }
        var cornerStyles = preserveContainerCornerStyles(snap, afterRect.width, afterRect.height);
        if (cornerStyles) {
          for (var cp in cornerStyles) {
            if (Object.prototype.hasOwnProperty.call(cornerStyles, cp)) {
              node.style[cp] = cornerStyles[cp];
              cStyles[cp] = cornerStyles[cp];
            }
          }
        }

        if (Object.keys(cStyles).length) {
          touched.push({ el: node, origStyleAttr: cOrigStyle, snapshot: cSnap, styles: cStyles });
        }
      }
    }

    var extraImg = {};
    if (growW) {
      el.style.maxWidth = origMaxW;
      el.style.flexShrink = origFlexShrink;
      var checkW = el.getBoundingClientRect().width;
      if (checkW + 0.5 < targetW) {
        el.style.maxWidth = 'none';
        if (el.getBoundingClientRect().width + 0.5 < targetW) {
          el.style.flexShrink = '0';
          extraImg.flexShrink = '0';
        }
        if (el.getBoundingClientRect().width > checkW + 0.5) {
          extraImg.maxWidth = 'none';
        } else {
          el.style.maxWidth = origMaxW;
        }
      }
    } else {
      el.style.maxWidth = origMaxW;
      el.style.flexShrink = origFlexShrink;
    }
    if (growH) {
      el.style.maxHeight = origMaxH;
      if (el.getBoundingClientRect().height + 0.5 < targetH) {
        el.style.maxHeight = 'none';
        extraImg.maxHeight = 'none';
      }
    } else {
      el.style.maxHeight = origMaxH;
    }

    return { touched: touched, extraImg: extraImg };
  }

  function buildContainersPayload(touched) {
    if (!touched || !touched.length) return null;
    var out = [];
    for (var i = 0; i < touched.length; i++) {
      out.push({ element: touched[i].snapshot, styles: touched[i].styles });
    }
    return out;
  }

  function resizeOnPointerDown(e) {
    if (!editingActive || dragModeActive || inlineEdit || resize) return;
    if (e.button !== 0 || !isResizeHandle(e.target) || !editSelectedEl) return;
    e.preventDefault();
    e.stopPropagation();
    var el = editSelectedEl;
    var dir = e.target.getAttribute('data-orion-resize-handle');
    var rect = el.getBoundingClientRect();
    var snapshot = buildElementDescription(el);
    var origStyleAttr = el.__orionOutlineSaved ? el.__orionOutlineSaved.styleAttr : el.getAttribute('style');
    try { e.target.setPointerCapture(e.pointerId); } catch (capErr) { /* events still arrive */ }
    resize = {
      el: el,
      handle: e.target,
      dir: dir,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startW: Math.max(1, rect.width),
      startH: Math.max(1, rect.height),
      aspect: Math.max(1, rect.width) / Math.max(1, rect.height),
      hasW: dir.indexOf('e') !== -1 || dir.indexOf('w') !== -1,
      hasH: dir.indexOf('n') !== -1 || dir.indexOf('s') !== -1,
      signX: dir.indexOf('w') !== -1 ? -1 : 1,
      signY: dir.indexOf('n') !== -1 ? -1 : 1,
      snapshot: snapshot,
      origStyleAttr: origStyleAttr,
      origElWidth: el.style.width,
      origElHeight: el.style.height,
      origElAspectRatio: el.style.aspectRatio,
      origElMaxW: el.style.maxWidth,
      origElMaxH: el.style.maxHeight,
      origElFlexShrink: el.style.flexShrink,
      touchedContainers: [],
      extraImg: {},
      moved: false
    };
    updateResizeBadge(rect);
  }

  function resizeOnPointerMove(e) {
    var r = resize;
    if (!r || e.pointerId !== r.pointerId) return;
    e.preventDefault();
    var dx = e.clientX - r.startX;
    var dy = e.clientY - r.startY;
    if (!r.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    r.moved = true;
    restoreTouchedContainers(r.touchedContainers);
    r.touchedContainers = [];
    r.el.style.width = r.origElWidth;
    r.el.style.height = r.origElHeight;
    r.el.style.aspectRatio = r.origElAspectRatio;
    r.el.style.maxWidth = r.origElMaxW;
    r.el.style.maxHeight = r.origElMaxH;
    r.el.style.flexShrink = r.origElFlexShrink;

    var rawW = Math.max(16, Math.min(4000, r.startW + r.signX * dx));
    var rawH = Math.max(16, Math.min(4000, r.startH + r.signY * dy));
    var nextW = rawW;
    var nextH = rawH;
    if (r.hasW && r.hasH && !e.shiftKey) {
      if (Math.abs(dx) / r.startW >= Math.abs(dy) / r.startH) {
        nextW = rawW;
        nextH = Math.max(16, Math.min(4000, nextW / r.aspect));
      } else {
        nextH = rawH;
        nextW = Math.max(16, Math.min(4000, nextH * r.aspect));
      }
    }
    var applied = applyImageSizeAndContainers(r.el, {
      nextW: r.hasW ? nextW : null,
      nextH: r.hasH ? nextH : null,
      startW: r.startW,
      startH: r.startH
    });
    r.touchedContainers = applied.touched;
    r.extraImg = applied.extraImg;
    var liveRect = r.el.getBoundingClientRect();
    syncResizeOverlay();
    updateResizeBadge(liveRect);
  }

  function commitImageResizePayload(el, snapshot, origStyleAttr, touchedContainers, opts) {
    var finalRect = el.getBoundingClientRect();
    var finalW = opts.hasW ? Math.max(1, Math.round(finalRect.width)) : null;
    var finalH = opts.hasH ? Math.max(1, Math.round(finalRect.height)) : null;
    var cleanStyleAttr = readCleanStyleAttr(el);
    if (el.__orionOutlineSaved) el.__orionOutlineSaved.styleAttr = cleanStyleAttr;
    syncResizeOverlay();

    var editId = ++inlineEditSequence;
    var pending = {
      id: editId,
      el: el,
      origStyleAttr: origStyleAttr,
      containers: touchedContainers,
      deselect: !!opts.deselect,
      timer: null
    };
    pending.timer = setTimeout(function () { resolveImageResize(false, editId); }, 3000);
    pendingResizes.push(pending);

    var payload = {};
    for (var k in snapshot) {
      if (Object.prototype.hasOwnProperty.call(snapshot, k)) payload[k] = snapshot[k];
    }
    if (finalW !== null) payload.width = finalW;
    if (finalH !== null) payload.height = finalH;
    if (opts.extraImg) {
      if (opts.extraImg.maxWidth) payload.maxWidth = opts.extraImg.maxWidth;
      if (opts.extraImg.maxHeight) payload.maxHeight = opts.extraImg.maxHeight;
      if (opts.extraImg.flexShrink) payload.flexShrink = opts.extraImg.flexShrink;
    }
    var containersPayload = buildContainersPayload(touchedContainers);
    if (containersPayload) payload.containers = containersPayload;
    if (opts.deselect) payload.deselect = true;
    payload.editId = editId;
    payload.newBoundingBox = { x: finalRect.left, y: finalRect.top, width: finalRect.width, height: finalRect.height };
    payload.newStyleAttr = cleanStyleAttr;
    post('element-resized', payload);
  }

  function endResize(commit) {
    var r = resize;
    if (!r) return;
    resize = null;
    try { r.handle.releasePointerCapture(r.pointerId); } catch (relErr) { /* already released */ }
    if (resizeBadge && resizeBadge.parentNode) resizeBadge.parentNode.removeChild(resizeBadge);
    resizeBadge = null;
    dragSuppressClick = true;
    setTimeout(function () { dragSuppressClick = false; }, 0);

    var finalRect = r.el.getBoundingClientRect();
    var finalW = r.hasW ? Math.max(1, Math.round(finalRect.width)) : null;
    var finalH = r.hasH ? Math.max(1, Math.round(finalRect.height)) : null;
    var changed = commit && r.moved && (
      (r.hasW && finalW !== Math.round(r.startW)) ||
      (r.hasH && finalH !== Math.round(r.startH))
    );
    if (!changed) {
      restoreTouchedContainers(r.touchedContainers);
      restoreElStyleAttr(r.el, r.origStyleAttr);
      syncResizeOverlay();
      return;
    }

    commitImageResizePayload(r.el, r.snapshot, r.origStyleAttr, r.touchedContainers, {
      hasW: r.hasW,
      hasH: r.hasH,
      extraImg: r.extraImg,
      deselect: false
    });
  }

  function resizeOnPointerUp(e) {
    if (!resize || e.pointerId !== resize.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    endResize(true);
  }

  function resizeOnPointerCancel(e) {
    if (resize && e.pointerId === resize.pointerId) endResize(false);
  }

  function resolveImageResize(ok, editId, sourceSync) {
    var idx = -1;
    for (var i = 0; i < pendingResizes.length; i++) {
      if (pendingResizes[i].id === editId) { idx = i; break; }
    }
    if (idx === -1) return;
    var entry = pendingResizes.splice(idx, 1)[0];
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
    if (!ok) {
      restoreTouchedContainers(entry.containers);
      restoreElStyleAttr(entry.el, entry.origStyleAttr);
      syncResizeOverlay();
      return;
    }
    if (sourceSync) applySourceSync(entry.el, sourceSync);
    if (entry.deselect && editSelectedEl === entry.el) {
      clearSelection(false);
    }
  }

  function applyImageSizeInFrame(size) {
    var el = editSelectedEl;
    if (!el || !size) return;
    var startRect = el.getBoundingClientRect();
    var snapshot = buildElementDescription(el);
    var origStyleAttr = el.__orionOutlineSaved ? el.__orionOutlineSaved.styleAttr : el.getAttribute('style');
    var hasW = size.width != null;
    var hasH = size.height != null;
    var applied = applyImageSizeAndContainers(el, {
      nextW: hasW ? Number(size.width) : null,
      nextH: hasH ? Number(size.height) : null,
      startW: Math.max(1, startRect.width),
      startH: Math.max(1, startRect.height)
    });
    commitImageResizePayload(el, snapshot, origStyleAttr, applied.touched, {
      hasW: hasW,
      hasH: hasH,
      extraImg: applied.extraImg,
      deselect: true
    });
  }

`;
