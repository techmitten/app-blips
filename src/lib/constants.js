// Docs site, opened from the Help key and the "?" shortcut.
export const DOCS_URL = 'https://docs.appblips.com/';
export const GITHUB_URL = 'https://github.com/TechMitten/app-blips';
export const DISCORD_URL = 'https://discord.gg/a7QfqbvaF9';

import {
  Wand2, Smartphone, Code2, Layout, TerminalSquare, Timer, CloudSun, Receipt,
  ListChecks, Edit2, Clock, ListTodo, Wallet, Monitor, Calculator, KeyRound,
  Ruler, Zap, Layers, Search, Rocket, Trophy, Radio, Keyboard, Gamepad2, Dices,
  Bomb, Target, Flame, Puzzle, Swords, Ghost, Worm, WholeWord, CalendarCheck,
  PiggyBank, Shapes, Drum, Hammer, CircleDot, CircleDotDashed, Atom, Palette,
  Bug, Gauge, Regex, Database, Braces, Hourglass, Bird, Blocks, Coins
} from 'lucide-react';

// The studios share one workspace pipeline (prompt -> code -> versions); the
// mode changes the prompts, starter ideas, default preview device and the
// default project name. Persisted per-project as `studioMode`. `description`
// is the user-facing "what makes this studio different" line -- surfaced in
// the studio switcher tooltips and the mobile menu.
export const STUDIO_MODES = {
  app: {
    key: 'app',
    label: 'App',
    article: 'app',
    untitledName: 'Untitled App',
    defaultPreviewMode: 'mobile',
    description: 'Interactive tools and dashboards — JavaScript-driven, saves your data, feels native on a phone.',
  },
  website: {
    key: 'website',
    label: 'Website',
    article: 'website',
    untitledName: 'Untitled Website',
    defaultPreviewMode: 'fill',
    description: 'Content-first pages — landing pages, portfolios, blogs — that you edit by clicking them in the preview.',
  },
  game: {
    key: 'game',
    label: 'Game',
    article: 'game',
    untitledName: 'Untitled Game',
    defaultPreviewMode: 'mobile',
    description: 'Playable browser games — canvas and Phaser engines, physics, scores and sound — with touch and keyboard controls.',
  },
  // An imported React + Vite project (src/lib/codebase/): real files and
  // folders instead of generated HTML pages. Only created by importing a .zip.
  codebase: {
    key: 'codebase',
    label: 'Imported site',
    article: 'site',
    untitledName: 'Imported Site',
    defaultPreviewMode: 'fill',
    description: 'A React + Vite project imported from a .zip — keeps its real files, exports back as a project.',
  },
};

// A saved or interrupted job's studioMode, defaulting unknown values to 'app'.
export const normalizeStudioMode = (mode) => (Object.hasOwn(STUDIO_MODES, mode) ? mode : 'app');

export const HTML_STREAM_START_RE = /```html|<!DOCTYPE html|<html[\s>]/i;

export const PRESET_COLORS = [
  "text-amber-600 bg-amber-50",
  "text-sky-600 bg-sky-50",
  "text-emerald-600 bg-emerald-50",
  "text-indigo-600 bg-indigo-50",
  "text-violet-600 bg-violet-50",
  "text-rose-600 bg-rose-50",
  "text-blue-600 bg-blue-50",
  "text-teal-600 bg-teal-50"
];

export const AVAILABLE_ICONS = {
  Wand2, Smartphone, Code2, Layout, TerminalSquare, Timer, CloudSun, Receipt, ListChecks, Edit2, Clock, ListTodo, Wallet, Calculator, KeyRound, Ruler, Zap, Layers, Search, Monitor, Trophy, Radio, Keyboard, Rocket, Gamepad2, Dices, Bomb, Target, Flame, Puzzle, Swords, Ghost, Worm, WholeWord, CalendarCheck, PiggyBank, Shapes, Drum, Hammer, CircleDot, CircleDotDashed, Atom, Palette, Bug, Gauge, Regex, Database, Braces, Hourglass, Bird, Blocks, Coins
};

// Starter-idea pools for each studio's gallery (data only).
export { STARTER_PRESETS } from './starterPresets/app.js';
export { GAME_STARTER_PRESETS } from './starterPresets/game.js';
export { WEBSITE_STARTER_PRESETS } from './starterPresets/website.js';
export { ASK_STARTER_PRESETS } from './starterPresets/ask.js';

// Ideas per page of each studio's starter gallery. The whole pool is shuffled
// on every launch, so the first page rotates between visits, and the rest can
// be slid through. Ask mode has no page size (it shows one fixed set).
export const STARTER_SAMPLE_SIZE = {
  app: 6,
  website: 4,
  game: 4
};

// How long the camera-shutter blink over the preview lasts after a
// screenshot. Review captures wait it out, so a batch never photographs it.
export const PREVIEW_SHUTTER_MS = 420;

export const PREVIEW_MODES = {
  mobile: {
    label: 'Smartphone',
    width: 399,
    height: 820,
    deviceClass: 'device-smartphone',
    isTouchChrome: true,
    zoomPadding: { h: 32, v: 32 }
  },
  tablet: {
    label: 'Tablet',
    width: 810,
    height: 1080,
    deviceClass: 'device-tablet',
    isTouchChrome: true,
    zoomPadding: { h: 52, v: 44 }
  },
  desktop: {
    label: 'Desktop',
    width: 1468,
    height: 1022,
    deviceClass: 'device-desktop',
    isTouchChrome: false,
    zoomPadding: { h: 72, v: 54 }
  },
  // A desktop browser without the mockup: the page takes the whole preview
  // area at its real pixel size. width/height are only the fallback box
  // before the first measurement (see usePreviewViewport).
  fill: {
    label: 'Full size',
    width: 1468,
    height: 1022,
    deviceClass: 'device-desktop',
    isTouchChrome: false,
    isFill: true,
    zoomPadding: { h: 0, v: 0 }
  }
};

// Where a device key leads. Desktop opens Full size by default (the framed
// desktop window is one click away on the Full size toggle); pressing it while
// already in either desktop view keeps the one the user picked.
export const presetTarget = (mode, previewMode) => {
  if (mode !== 'desktop') return mode;
  return previewMode === 'desktop' || PREVIEW_MODES[previewMode]?.isFill ? previewMode : 'fill';
};

// Desktop has no orientation concept (it's a browser window, not a rotatable
// device), so only touch-chrome modes (mobile/tablet) swap width/height here.
