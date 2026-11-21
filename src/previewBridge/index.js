/**
 * The in-frame preview bridge script, as source text (see ../previewBridge.js
 * for what it does and how it is injected).
 *
 * Written in ES5-ish style with string concatenation so it never needs a
 * backtick or a `${`, and so it parses even if a generated document does
 * something odd. `__ORION_TOKEN__` is substituted per render.
 *
 * The script is one IIFE split across these files by topic. They are joined
 * in this exact order, and ORDER MATTERS: `var` initialisers and top-level
 * statements run in sequence, and every part shares one closure scope.
 */
import prelude from './prelude.js';
import storageShim from './storageShim.js';
import editingCore from './editingCore.js';
import inlineTextFormat from './inlineTextFormat.js';
import inlineTextSession from './inlineTextSession.js';
import pickerEvents from './pickerEvents.js';
import dragMove from './dragMove.js';
import boxSelect from './boxSelect.js';
import insertMenu from './insertMenu.js';
import imageResize from './imageResize.js';
import selectionAndMode from './selectionAndMode.js';
import deadLinks from './deadLinks.js';
import youtube from './youtube.js';
import touchScroll from './touchScroll.js';
import messages from './messages.js';
import screenshot from './screenshot.js';
import runtimeErrors from './runtimeErrors.js';

export const BRIDGE_SOURCE = [
  prelude,
  storageShim,
  editingCore,
  inlineTextFormat,
  inlineTextSession,
  pickerEvents,
  dragMove,
  boxSelect,
  insertMenu,
  imageResize,
  selectionAndMode,
  deadLinks,
  youtube,
  touchScroll,
  messages,
  screenshot,
  runtimeErrors,
].join('');
