import { safeStorage } from './config.js';
import { WEB_APP_URL } from './constants.js';
import { isDesktop } from './desktop.js';

export const SURVEY_KEY = 'appblips-onboarding-survey';
export const CLIENT_ID_KEY = 'appblips-client-id';

export const SURVEY_QUESTIONS = [
  {
    id: 'goal',
    titlePlain: 'What are you hoping to ',
    titleAccent: 'build first?',
    description: 'This helps us understand what kinds of projects matter most to you. Optional — feel free to skip.',
    fieldLabel: 'Your main goal',
    options: [
      { id: 'web-app', label: 'Web app or tool', hint: 'Dashboards, utilities, trackers, or interactive apps' },
      { id: 'website', label: 'Website or landing page', hint: 'Portfolio, business site, or marketing page' },
      { id: 'game', label: 'Browser game', hint: 'Arcade, puzzle, or 2D/3D playable game' },
      { id: 'explore', label: 'Just exploring', hint: 'Testing out what AppBlips can do' },
    ],
  },
  {
    id: 'role',
    titlePlain: 'What best ',
    titleAccent: 'describes you?',
    description: 'Tell us a little about your background so we can tailor AppBlips better. Optional — feel free to skip.',
    fieldLabel: 'Your role',
    options: [
      { id: 'founder', label: 'Founder or indie maker', hint: 'Building a product, side project, or startup idea' },
      { id: 'developer', label: 'Developer', hint: 'Prototyping and shipping faster with AI' },
      { id: 'designer', label: 'Designer or creative', hint: 'Turning visual ideas into working code' },
      { id: 'student', label: 'Student or learner', hint: 'Learning how apps and websites work' },
      { id: 'hobbyist', label: 'Hobbyist or personal use', hint: 'Building things for fun or everyday use' },
    ],
  },
  {
    id: 'experience',
    titlePlain: 'How comfortable are you ',
    titleAccent: 'with coding?',
    description: 'AppBlips works great either way — knowing your comfort level helps us improve the experience. Optional.',
    fieldLabel: 'Coding experience',
    options: [
      { id: 'none', label: 'No coding experience', hint: 'I build purely with plain-English prompts' },
      { id: 'some', label: 'A little HTML, CSS, or JS', hint: 'I know the basics or tweak small details' },
      { id: 'experienced', label: 'Experienced developer', hint: 'I write and ship code regularly' },
    ],
  },
];

export const SURVEY_STEP_IDS = SURVEY_QUESTIONS.map((q) => q.id);

const VALID_BY_QUESTION = Object.fromEntries(
  SURVEY_QUESTIONS.map((q) => [q.id, new Set(q.options.map((o) => o.id))]),
);

const cleanAnswer = (questionId, value) => (
  VALID_BY_QUESTION[questionId]?.has(value) ? value : ''
);

export const loadSurvey = () => {
  try {
    const saved = JSON.parse(safeStorage('local')?.getItem(SURVEY_KEY) || '{}');
    return {
      goal: cleanAnswer('goal', saved?.goal),
      role: cleanAnswer('role', saved?.role),
      experience: cleanAnswer('experience', saved?.experience),
    };
  } catch {
    return { goal: '', role: '', experience: '' };
  }
};

export const saveSurvey = (answers) => {
  const clean = {
    goal: cleanAnswer('goal', answers?.goal),
    role: cleanAnswer('role', answers?.role),
    experience: cleanAnswer('experience', answers?.experience),
  };
  safeStorage('local')?.setItem(SURVEY_KEY, JSON.stringify(clean));
  return clean;
};

const getClientId = () => {
  const storage = safeStorage('local');
  const existing = storage?.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const created = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  storage?.setItem(CLIENT_ID_KEY, created);
  return created;
};

const detectPlatform = () => {
  if (isDesktop) return 'desktop';
  if (typeof window !== 'undefined' && (
    Boolean(window.androidBridge)
    || (window.Capacitor && typeof window.Capacitor.getPlatform === 'function' && window.Capacitor.getPlatform() === 'android')
  )) {
    return 'android';
  }
  return 'web';
};

export const submitOnboardingSurvey = async (answers) => {
  const clean = saveSurvey(answers);
  if (!clean.goal && !clean.role && !clean.experience) return;

  const platform = detectPlatform();
  const baseUrl = platform === 'web' ? '' : WEB_APP_URL.replace(/\/$/, '');
  const endpoint = `${baseUrl}/api/onboarding`;

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: getClientId(),
        platform,
        ...clean,
      }),
      keepalive: true,
    });
  } catch {
    // Fire-and-forget: never block or fail onboarding when offline or self-hosted.
  }
};
