// Preview bridge source, part 1 of 17. Opens the IIFE: codebase mode, the autofocus fix and the build mute.
//
// Plain text, not a module of its own: ./index.js joins every part in order
// into one IIFE that runs inside the preview frame, so all parts share one
// closure scope (a var or function here is visible in the others). Same rules
// as the rest of the bridge: ES5-ish, no backtick, no "</", and no "${" except
// the protocol constants in the prelude.
import { BRIDGE_CHANNEL, BRIDGE_PROTOCOL_VERSION } from './protocol.js';

export default `(function () {
  'use strict';

  var TOKEN = '__ORION_TOKEN__';
  // Imported codebases (studioMode 'codebase') are single-page React apps
  // whose router owns in-app links; see onLinkClick.
  var PROJECT_MODE = __ORION_PROJECT_MODE__;
  var CHANNEL = '${BRIDGE_CHANNEL}';
  var VERSION = ${BRIDGE_PROTOCOL_VERSION};

  // Chromium refuses declarative autofocus in this deliberately opaque,
  // cross-origin preview frame and logs a warning for every generated input.
  // Strip only the preview DOM attribute before the browser's autofocus task
  // runs. The user's source is untouched, so exports retain
  // the requested autofocus behavior on their normal same-origin page.
  function removeBlockedAutofocus(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.hasAttribute && root.hasAttribute('autofocus')) root.removeAttribute('autofocus');
    if (root.querySelectorAll) {
      var autofocusNodes = root.querySelectorAll('[autofocus]');
      for (var autofocusIndex = 0; autofocusIndex < autofocusNodes.length; autofocusIndex += 1) {
        autofocusNodes[autofocusIndex].removeAttribute('autofocus');
      }
    }
  }

  var autofocusObserver = new MutationObserver(function (records) {
    for (var recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
      var record = records[recordIndex];
      if (record.type === 'attributes') removeBlockedAutofocus(record.target);
      for (var nodeIndex = 0; nodeIndex < record.addedNodes.length; nodeIndex += 1) {
        removeBlockedAutofocus(record.addedNodes[nodeIndex]);
      }
    }
  });
  autofocusObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['autofocus'],
    childList: true,
    subtree: true
  });

  // Build mute: while AppBlips builds an edit, the old document keeps running
  // under the building overlay, and a game's sound would keep playing. The
  // parent sends set-muted; every Web Audio context the page makes is tracked
  // here (this script runs before the page's own) and suspended, and media
  // elements are muted. Unmuting restores only what this muted.
  var buildMuted = false;
  var audioContexts = [];
  var mutedContexts = [];
  var mutedMedia = [];
  var playedMedia = [];
  function muteContext(ctx) {
    if (ctx.state === 'running') {
      if (mutedContexts.indexOf(ctx) === -1) mutedContexts.push(ctx);
      try { var sp = ctx.__orionSuspend(); if (sp && sp.catch) sp.catch(function () {}); } catch (err) { /* closed */ }
    }
  }
  function muteMedia(el) {
    if (!el || el.muted || mutedMedia.indexOf(el) !== -1) return;
    el.muted = true;
    mutedMedia.push(el);
  }
  (function () {
    var NativeAC = window.AudioContext || window.webkitAudioContext;
    if (typeof NativeAC !== 'function' || typeof Reflect === 'undefined') return;
    function TrackedAudioContext() {
      var ctx = Reflect.construct(NativeAC, arguments, new.target || TrackedAudioContext);
      var nativeResume = ctx.resume;
      ctx.__orionSuspend = function () { return NativeAC.prototype.suspend.call(ctx); };
      ctx.__orionResume = function () { return nativeResume.call(ctx); };
      // A game resumes its context on the next key press; while muted that
      // is remembered for unmute instead.
      ctx.resume = function () {
        if (buildMuted) {
          if (mutedContexts.indexOf(ctx) === -1) mutedContexts.push(ctx);
          return Promise.resolve();
        }
        return nativeResume.call(ctx);
      };
      audioContexts.push(ctx);
      if (buildMuted) muteContext(ctx);
      return ctx;
    }
    TrackedAudioContext.prototype = NativeAC.prototype;
    try { Object.setPrototypeOf(TrackedAudioContext, NativeAC); } catch (err) { /* statics stay native */ }
    try {
      if (window.AudioContext) window.AudioContext = TrackedAudioContext;
      if (window.webkitAudioContext) window.webkitAudioContext = TrackedAudioContext;
    } catch (err) { /* left native */ }
  })();
  (function () {
    var proto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
    if (!proto || typeof proto.play !== 'function') return;
    var nativePlay = proto.play;
    // Covers new Audio() objects that never enter the document.
    proto.play = function () {
      if (playedMedia.indexOf(this) === -1) playedMedia.push(this);
      if (buildMuted) muteMedia(this);
      return nativePlay.apply(this, arguments);
    };
  })();
  function setBuildMuted(next) {
    if (next === buildMuted) return;
    buildMuted = next;
    var i;
    if (next) {
      for (i = 0; i < audioContexts.length; i += 1) muteContext(audioContexts[i]);
      var media = document.querySelectorAll('audio, video');
      for (i = 0; i < media.length; i += 1) muteMedia(media[i]);
      for (i = 0; i < playedMedia.length; i += 1) muteMedia(playedMedia[i]);
      return;
    }
    var contexts = mutedContexts;
    mutedContexts = [];
    for (i = 0; i < contexts.length; i += 1) {
      try {
        if (contexts[i].state !== 'closed') {
          var rp = contexts[i].__orionResume();
          if (rp && rp.catch) rp.catch(function () {});
        }
      } catch (err) { /* closed */ }
    }
    var els = mutedMedia;
    mutedMedia = [];
    for (i = 0; i < els.length; i += 1) els[i].muted = false;
  }

  function post(type, payload) {
    try {
      // targetOrigin '*' is required: this frame has an opaque origin and
      // cannot know the parent's. It is only acceptable because no message
      // in this protocol carries a secret. Do not add one.
      parent.postMessage(
        { __orion: CHANNEL, v: VERSION, token: TOKEN, type: type, payload: payload },
        '*'
      );
    } catch (err) { /* parent gone */ }
  }

`;
