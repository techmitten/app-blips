// Preview bridge source, part 16 of 17. Section 5: screenshot capture (DOM and CSS extraction only).
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
export default `  // ------------------------------------------------------------------
  // 5. Screenshot capture (DOM + CSS extraction only)
  //
  // No rasterization happens here -- see the module header comment for why:
  // any library that needs a helper iframe to compute styles gets blocked
  // reading that iframe's .document, because sandboxing forces a fresh
  // opaque origin onto anything this frame creates. This just clones the
  // live document and collects reachable stylesheet text; the parent turns
  // that into a canvas (rasterizeDomSnapshot in src/lib/attachments.js).
  // ------------------------------------------------------------------

  function isBlankColor(c) {
    return !c || c === 'transparent' || c.indexOf('rgba(0, 0, 0, 0)') === 0;
  }

  // Flattens a stylesheet to plain rule text, resolving conditional groups
  // HERE, against the live frame.
  //
  // This is load-bearing: an SVG rendered through an <img> evaluates media
  // queries against its own bare context, where prefers-color-scheme is
  // always light. A dark-themed app captured without this comes back in its
  // light theme -- and since the markup still carries dark-theme colors
  // inline, that reads as a mostly-blank screenshot (white text on a light
  // background). Resolving the query here bakes in the theme the user is
  // actually looking at.
  function flattenRules(rules) {
    var out = '';
    for (var k = 0; k < rules.length; k++) {
      var rule = rules[k];
      var nested = rule.cssRules;
      var text = rule.cssText || '';
      if (rule.type === 4) { // CSSMediaRule -- the one thing that must be resolved here
        var matches = true;
        try {
          matches = window.matchMedia(rule.media.mediaText).matches;
        } catch (mqErr) { matches = true; } // unreadable condition: keep the rules
        if (matches && nested) out += flattenRules(nested);
      } else if (nested && nested.length && rule.type !== 7 && text.charAt(0) === '@') {
        // @supports / @layer / @container: the SVG renders in this same
        // engine, so these evaluate identically there -- keep the at-rule
        // intact (dropping it on a failed re-evaluation loses real styles)
        // and just recurse so any media query nested inside still resolves.
        // @keyframes (type 7) and nested style rules are emitted verbatim.
        var brace = text.indexOf('{');
        if (brace > -1) out += text.slice(0, brace) + '{' + flattenRules(nested) + '}\\n';
        else out += text + '\\n';
      } else {
        out += text + '\\n';
      }
    }
    return out;
  }

  function captureDomSnapshot(requestId) {
    try {
      // Live pixel/field state has to be read BEFORE cloning and re-applied
      // afterwards: cloneNode copies attributes, not canvas bitmaps or the
      // .value/.checked properties the user actually typed into.
      var i;
      var liveCanvases = document.querySelectorAll('canvas');
      var canvasDataUrls = [];
      for (i = 0; i < liveCanvases.length; i++) {
        try {
          canvasDataUrls.push(liveCanvases[i].toDataURL());
        } catch (canvasErr) {
          canvasDataUrls.push(null); // tainted canvas inside the generated app itself
        }
      }
      var liveFields = document.querySelectorAll('input, textarea, select');
      var fieldValues = [];
      var fieldChecked = [];
      for (i = 0; i < liveFields.length; i++) {
        fieldValues.push(liveFields[i].value);
        fieldChecked.push(!!liveFields[i].checked);
      }

      // The whole <html> element is serialized, not just <body>: theme state
      // is routinely carried as a class or data- attribute up there
      // (class="dark", data-theme="..."), and dropping it silently renders
      // the app in its light theme.
      var clone = document.documentElement.cloneNode(true);

      // Freeze each element's live visual state, BEFORE anything is removed
      // from the clone, so the live and cloned element lists still line up
      // index for index.
      //
      // CSS animations do not run inside an SVG rendered through an <img>:
      // it renders in a static context where they sit frozen at their FIRST
      // keyframe. An app that fades or slides its content in -- the default
      // entrance pattern, opacity 0 animating to 1 with a forwards fill --
      // then captures as an empty shell, with only its non-animated chrome
      // (headers, nav bars, floating buttons) visible. Animations also
      // outrank inline styles in the cascade, so it is not enough to write
      // the settled values here: each element also has to be told
      // animation: none, or the frozen first keyframe wins anyway.
      var liveEls = document.documentElement.querySelectorAll('*');
      var cloneEls = clone.querySelectorAll('*');
      for (i = 0; i < liveEls.length && i < cloneEls.length; i++) {
        var live = window.getComputedStyle(liveEls[i]);
        // opacity/transform are written unconditionally: a finished
        // entrance animation computes to the settled value (opacity 1),
        // while the rule underneath it still says opacity: 0 -- so
        // skipping "default-looking" values would reinstate the bug.
        var frozen =
          'animation:none !important;transition:none !important;' +
          'opacity:' + live.opacity + ';' +
          'visibility:' + live.visibility + ';' +
          'transform:' + (live.transform || 'none') + ';' +
          'filter:' + (live.filter || 'none') + ';';
        var prior = cloneEls[i].getAttribute('style');
        cloneEls[i].setAttribute('style', (prior ? prior + ';' : '') + frozen);
      }

      // A clone keeps no scroll offsets. The window's is applied by the
      // parent, but app layouts usually scroll an inner panel instead, which
      // would always capture at its top. Shift that panel's children by its
      // offset with the translate property, which composes with the frozen
      // transform above rather than replacing it. Fixed and sticky children
      // stay put, as they do on screen.
      var scrollingEl = document.scrollingElement || document.documentElement;
      for (i = 0; i < liveEls.length && i < cloneEls.length; i++) {
        var scrolledEl = liveEls[i];
        if (scrolledEl === scrollingEl || (!scrolledEl.scrollTop && !scrolledEl.scrollLeft)) continue;
        var liveKids = scrolledEl.children;
        var cloneKids = cloneEls[i].children;
        for (var ki = 0; ki < liveKids.length && ki < cloneKids.length; ki++) {
          var kidPosition = window.getComputedStyle(liveKids[ki]).position;
          if (kidPosition === 'fixed' || kidPosition === 'sticky') continue;
          var kidStyle = cloneKids[ki].getAttribute('style');
          cloneKids[ki].setAttribute('style', (kidStyle ? kidStyle + ';' : '') +
            'translate:' + -scrolledEl.scrollLeft + 'px ' + -scrolledEl.scrollTop + 'px !important;');
        }
      }

      // <head> holds nothing renderable -- its stylesheet text is collected
      // below instead -- and skipping it keeps the payload small.
      var clonedHead = clone.querySelector('head');
      if (clonedHead && clonedHead.parentNode) clonedHead.parentNode.removeChild(clonedHead);

      // Scripts never execute inside an SVG image, and their raw text is the
      // single most likely thing to break the XML parse the parent depends
      // on. <noscript> holds unparsed markup that does the same, and <link>
      // is dead weight since an SVG rendered through an <img> loads no
      // external resources at all. This also drops the bridge's own injected
      // script, so it can never reach the parent.
      var junk = clone.querySelectorAll('script, noscript, link, [data-orion-bridge="true"], [data-orion-caret]');
      for (i = 0; i < junk.length; i++) {
        if (junk[i].parentNode) junk[i].parentNode.removeChild(junk[i]);
      }

      var cloneCanvases = clone.querySelectorAll('canvas');
      for (i = 0; i < cloneCanvases.length; i++) {
        if (!canvasDataUrls[i] || !cloneCanvases[i].parentNode) continue;
        var img = document.createElement('img');
        img.setAttribute('src', canvasDataUrls[i]);
        var canvasStyle = cloneCanvases[i].getAttribute('style');
        if (canvasStyle) img.setAttribute('style', canvasStyle);
        img.setAttribute('width', String(cloneCanvases[i].width));
        img.setAttribute('height', String(cloneCanvases[i].height));
        cloneCanvases[i].parentNode.replaceChild(img, cloneCanvases[i]);
      }

      var cloneFields = clone.querySelectorAll('input, textarea, select');
      for (i = 0; i < cloneFields.length; i++) {
        var cf = cloneFields[i];
        var value = fieldValues[i];
        if (value === undefined) continue;
        if (cf.tagName === 'TEXTAREA') {
          cf.textContent = value;
        } else if (cf.tagName === 'SELECT') {
          var opts = cf.querySelectorAll('option');
          for (var oi = 0; oi < opts.length; oi++) {
            if (opts[oi].value === value) opts[oi].setAttribute('selected', 'selected');
            else opts[oi].removeAttribute('selected');
          }
        } else if (cf.type === 'checkbox' || cf.type === 'radio') {
          if (fieldChecked[i]) cf.setAttribute('checked', 'checked');
          else cf.removeAttribute('checked');
        } else {
          cf.setAttribute('value', value);
        }
      }

      // A surviving srcset would let the renderer prefer an external
      // candidate over the data: URI the parent substitutes into src.
      var srcsetEls = clone.querySelectorAll('[srcset]');
      for (i = 0; i < srcsetEls.length; i++) srcsetEls[i].removeAttribute('srcset');

      // HTML allows attribute names XML does not (@click, :class, x-on:click,
      // [prop], a stray quote...). XMLSerializer emits them verbatim, and one
      // such name fails the whole SVG parse. They carry no visual meaning in a
      // static snapshot, so drop any that are not valid XML names (a single
      // prefix colon is only kept for the namespaces the serializer declares).
      var xmlNameRe = /^[A-Za-z_][A-Za-z0-9_.-]*(:[A-Za-z_][A-Za-z0-9_.-]*)?$/;
      var allEls = clone.querySelectorAll('*');
      var elIdx, attrIdx;
      var badAttrs = [];
      for (elIdx = -1; elIdx < allEls.length; elIdx++) {
        var el = elIdx < 0 ? clone : allEls[elIdx];
        for (attrIdx = 0; attrIdx < el.attributes.length; attrIdx++) {
          var attrName = el.attributes[attrIdx].name;
          if (!xmlNameRe.test(attrName) || (attrName.indexOf(':') !== -1 && !/^(xml|xlink|xmlns):/.test(attrName))) {
            badAttrs.push([el, attrName]);
          }
        }
      }
      for (i = 0; i < badAttrs.length; i++) badAttrs[i][0].removeAttribute(badAttrs[i][1]);

      var css = '';
      var externalStyleUrls = [];
      var si;
      for (si = 0; si < document.styleSheets.length; si++) {
        var sheet = document.styleSheets[si];
        try {
          if (sheet.disabled) continue;
          css += flattenRules(sheet.cssRules);
        } catch (sheetErr) {
          // Cross-origin sheet: this document isn't allowed to read its
          // rules. Hand the URL to the parent, which can still fetch the
          // text over the network (that's how Google Fonts survives).
          if (sheet.href) externalStyleUrls.push(sheet.href);
        }
      }

      var docEl = document.documentElement;
      var rootStyle = window.getComputedStyle(docEl);

      // Custom properties are usually declared on :root -- which, inside the
      // SVG the parent builds, is the <svg> element, not this <html>. Pin the
      // live resolved value of every custom property the CSS mentions onto
      // the cloned root so every var() reference still resolves.
      var varNames = {};
      var varRe = /--[A-Za-z0-9_-]+/g;
      var varMatch;
      while ((varMatch = varRe.exec(css))) varNames[varMatch[0]] = true;
      var rootInlineStyle = '';
      for (var varName in varNames) {
        if (!Object.prototype.hasOwnProperty.call(varNames, varName)) continue;
        var varValue = rootStyle.getPropertyValue(varName);
        if (varValue) rootInlineStyle += varName + ':' + varValue + ';';
      }
      // Percentage heights need an unbroken chain from the root, which the
      // parent's wrapper can't supply on this element's behalf.
      clone.setAttribute(
        'style',
        (clone.getAttribute('style') || '') + ';' + rootInlineStyle + 'width:100%;height:100%;'
      );

      var bodyBg = window.getComputedStyle(document.body).backgroundColor;
      var htmlBg = rootStyle.backgroundColor;

      post('dom-snapshot', {
        requestId: requestId,
        // XMLSerializer, NOT outerHTML: foreignObject content has to parse as
        // XML, and the HTML serialization of a single void element
        // (<meta charset="UTF-8">, <br>, <img ...>) is enough to fail the
        // whole SVG parse and produce an empty screenshot.
        html: new XMLSerializer().serializeToString(clone),
        css: css,
        externalStyleUrls: externalStyleUrls,
        backgroundColor: isBlankColor(bodyBg) ? (isBlankColor(htmlBg) ? '#ffffff' : htmlBg) : bodyBg,
        // rem resolves against the SVG root, not this document's <html>, so
        // the parent has to put this back on the <svg> element itself.
        rootFontSize: rootStyle.fontSize,
        scrollX: window.pageXOffset || 0,
        scrollY: window.pageYOffset || 0,
        width: docEl.clientWidth || window.innerWidth,
        height: docEl.clientHeight || window.innerHeight
      });
    } catch (err) {
      post('screenshot-error', { requestId: requestId, message: String((err && err.message) || err) });
    }
  }

`;
