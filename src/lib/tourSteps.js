// Guided-tour content and persistence. Pure, so the step lists can be
// reasoned about (and tested) without React or the DOM.
//
// The tour comes in two parts. The home tour (buildHomeTourSteps) covers the
// home page: the composer, the studio switch and the side rail. The build
// tour (buildTourSteps) covers the workspace once a build exists: Build/Ask,
// preview, versions, download, share and chats. Each part remembers on its
// own whether it was seen.
//
// Each step names one or more `data-tour` anchors, tried in order: several
// controls only render after a first build or at wide widths, so a step falls
// back to a broader anchor rather than losing its spotlight. `view` switches
// the mobile pane before the step is measured.

import { SHORTCUT_HINTS } from './shortcuts.js';

// The build tour keeps the key of the single tour it grew out of (bumped
// from v1 when that was rewritten), so people who already finished or
// dismissed it aren't offered it again. The home tour is new.
export const TOUR_KEY = 'appblips-tour-v2';
export const HOME_TOUR_KEY = 'appblips-tour-home-v1';
const TOUR_KEYS = { build: TOUR_KEY, home: HOME_TOUR_KEY };

// 'dismissed' | 'completed' | null (never seen), per part: 'home' | 'build'.
export function getTourState(part = 'build') {
  try { return localStorage.getItem(TOUR_KEYS[part]); }
  catch { return null; }
}

export function setTourState(state, part = 'build') {
  try { localStorage.setItem(TOUR_KEYS[part], state); } catch { /* Optional preference. */ }
}

// The home page, before anything is built.
export function buildHomeTourSteps({ wideScreen }) {
  const steps = [
    {
      id: 'idea',
      icon: 'idea',
      target: ['prompt'],
      title: 'Describe what you want',
      body: 'Say who it is for and what it should do. AppBlips builds it and runs it right here, then you refine it one message at a time.',
      tips: [
        'Attach an image to show what you mean, or use the mic to speak.',
        'Enter sends, Shift + Enter adds a new line.',
      ],
    },
    {
      id: 'studios',
      icon: 'studios',
      target: ['studios', 'prompt'],
      title: 'Pick what you are making',
      body: 'App, Website or Game: each studio is tuned for what it makes. The light at the top of the page shows which one you are in.',
      tips: ['Switching keeps what you have typed.'],
    },
  ];
  if (wideScreen) {
    steps.push(
      {
        id: 'start',
        icon: 'start',
        target: ['start'],
        title: 'Start something new',
        body: 'Begin a new app, website or game here, or import a site you already have: an HTML page, a website .zip or a React + Vite project.',
        tips: ['Explore shows what others have built with AppBlips.'],
      },
      {
        id: 'finish',
        icon: 'finish',
        target: ['apps'],
        title: 'Your work, saved',
        body: `Everything saves automatically. Saved projects (${SHORTCUT_HINTS.apps}) reopens, renames or deletes your projects.`,
        tips: [
          'Settings and Extensions are at the bottom of this menu, with Help, What’s New and this tour.',
          'Once you have a build, a second tour walks through the workspace.',
        ],
      },
    );
  } else {
    // One step for the whole drawer: highlighting the same closed hamburger
    // twice in a row reads as the tour being stuck.
    steps.push({
      id: 'finish',
      icon: 'menu',
      target: ['menu'],
      title: 'Everything else is in the menu',
      body: 'Start a new app, website or game, import a site you already have, or reopen your saved projects.',
      tips: [
        'Explore shows what others have built with AppBlips.',
        'Settings, Extensions, Help, What’s New and this tour live here too.',
        'Once you have a build, a second tour walks through the workspace.',
      ],
    });
  }
  return steps;
}

export function buildTourSteps({ wideScreen, hasCode, showCodeView, studioMode, isForcedMobile = false }) {
  const site = studioMode === 'website';
  const game = studioMode === 'game';
  // An imported React + Vite project: no page strip, no Publish or Open, and
  // Export hands back the whole project as a .zip.
  const codebase = studioMode === 'codebase';
  const noun = site || codebase ? 'site' : game ? 'game' : 'app';
  const steps = [];

  steps.push({
    id: 'refine',
    icon: 'idea',
    target: ['prompt'],
    view: 'chat',
    title: 'Keep refining',
    body: codebase
      ? 'Tell AppBlips what to change in your imported site. It reads and edits the project\'s real files, one change at a time.'
      : `Each message changes your ${noun} in place, one step at a time. Say what to add, fix or restyle.`,
    tips: ['Attach a screenshot of the preview to point at what you mean.'],
  });

  steps.push({
    id: 'modes',
    icon: 'modes',
    target: ['mode', 'prompt'],
    view: 'chat',
    title: 'Build or Ask',
    body: 'The mode key at the top of the chat switches what your message does.',
    tips: [
      `Build changes your ${noun}.`,
      `Ask answers questions about it without changing anything.`,
    ],
  });

  steps.push({
    id: 'preview',
    icon: 'preview',
    target: ['preview'],
    view: 'preview',
    title: `Try it live`,
    body: `Preview runs your ${noun} for real, so you can click, type, and test as you go.${site ? ' Links between pages work, and the page menu jumps between them.' : ''}${codebase ? ' The Files tab shows the project\'s files.' : showCodeView ? ' The Code tab shows the generated HTML.' : ''}`,
    tips: wideScreen ? undefined : ['Use Chat and Preview at the top to switch panels.'],
  });

  if (!isForcedMobile) {
    steps.push({
      id: 'devices',
      icon: 'devices',
      target: ['devices', 'tools', 'preview'],
      view: 'preview',
      title: 'Check every screen size',
      body: wideScreen
        ? 'Switch between phone, tablet, and desktop frames. Beside them, rotate a phone or tablet, use Full size to fill the whole preview area, or reload. Zoom sits on the right.'
        : 'Preview tools switch between phone, tablet, and desktop frames, and add rotation, Full size, and zoom.',
    });
  }

  if (site && hasCode) {
    steps.push({
      id: 'edit',
      icon: 'edit',
      target: ['preview'],
      view: 'preview',
      title: 'Edit text directly',
      body: 'Turn on Edit Mode in the preview toolbar, then click any element to change its words, font, color, links or images, or to duplicate or delete it. Drag elements anywhere on the page to move them. No prompt needed. Every change is saved as a new version.',
    });
  }

  steps.push({
    id: 'versions',
    icon: 'history',
    target: ['versions', 'tools', 'history', 'preview'],
    view: 'preview',
    title: 'Every change is a version',
    body: wideScreen
      ? `Step back and forward here (${SHORTCUT_HINTS.undo} / ${SHORTCUT_HINTS.redo}). History lists every checkpoint, grouped by chat session.`
      : 'Preview tools step back and forward through versions. History in the menu lists every checkpoint, grouped by chat session.',
  });

  // The download key, then Publish: left to right as they sit in the toolbar.
  // An imported site has only the download key (labelled Export there).
  steps.push(codebase
    ? {
      id: 'download',
      icon: 'download',
      target: ['download', 'preview'],
      view: 'preview',
      title: 'Take it with you',
      body: 'Export downloads the whole project as a .zip, ready for npm install. Files you did not change come back exactly as they were.',
    }
    : {
      id: 'download',
      icon: 'download',
      target: ['download', 'preview'],
      view: 'preview',
      title: 'Download',
      body: `The download key saves your ${noun}${site ? ' as a ZIP of pages' : ' as a single HTML file'} you can open in any browser or host anywhere.`,
      ...(studioMode === 'app' ? { tips: ['For a React app it asks first: HTML file, or a React project to keep building with npm.'] } : {}),
    });

  if (!codebase) {
    steps.push({
      id: 'share',
      icon: 'share',
      target: ['publish', 'preview'],
      view: 'preview',
      title: 'Share it',
      body: `Publish puts your ${noun} online at a free surge.sh address you can send to anyone.`,
      tips: ['Open in a new tab runs it in your browser.'],
    });
  }

  steps.push({
    id: 'chats',
    icon: 'chats',
    target: ['newchat', 'prompt'],
    view: 'chat',
    title: 'Fresh chat, same project',
    body: 'Start a new chat when the conversation gets long or you change direction. Your versions stay; the model just starts from the current code with a clean slate.',
    tips: wideScreen ? undefined : ['Open the menu and tap New chat once you have a build.'],
  });

  if (wideScreen) {
    steps.push({
      id: 'finish',
      icon: 'finish',
      target: ['history', 'tour', 'help'],
      title: 'You are ready',
      body: `History opens every checkpoint of this ${noun}, grouped by chat. Exit, at the bottom of this menu, closes the project and returns to the home page. You can replay this tour from Tour any time.`,
      tips: [
        'Settings: theme, chat font, Code tab, AI provider and reasoning.',
        'Settings → Extensions adds services like contact forms, payments, analytics, live chat and AI images; Settings → Tools has SEO and My images.',
        `Help (${SHORTCUT_HINTS.help}) opens the full docs.`,
      ],
    });
  } else {
    // One step for the whole drawer: highlighting the same closed hamburger
    // several times in a row reads as the tour being stuck.
    steps.push({
      id: 'finish',
      icon: 'menu',
      target: ['menu'],
      title: 'Everything else is in the menu',
      body: `History lists every checkpoint of this ${noun}, and Exit closes the project and returns to the home page.`,
      tips: [
        'Projects: reopen, rename, or delete saved projects.',
        'Settings (including Extensions and Tools) and Help live here too.',
        'Take the tour replays this walkthrough.',
      ],
    });
  }
  return steps;
}
