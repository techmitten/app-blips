// Keeps an unsent prompt across the Free AI sign-in (freeSignIn.js). Sign-in
// is meant to stay in a popup, but some browsers (mobile, blocked popups) send
// the whole page through Google or GitHub and back. That full page load would
// land on the App home page and drop the typed prompt. So
// the prompt, its studio and project are saved just before the sign-in opens,
// and the next page load picks them up once.
import { safeStorage } from './config.js';

const KEY = 'appblips-sign-in-handoff';
// A sign-in that takes longer than this was abandoned; don't revive its prompt.
const MAX_AGE_MS = 30 * 60 * 1000;

export const savePromptForSignIn = ({ prompt, studioMode, projectId }) => {
  try {
    safeStorage('local')?.setItem(KEY, JSON.stringify({
      prompt,
      studioMode: studioMode || null,
      projectId: projectId || null,
      savedAt: Date.now(),
    }));
  } catch {
    // Storage unavailable: the prompt just isn't kept across a page load.
  }
};

export const clearPromptForSignIn = () => {
  try {
    safeStorage('local')?.removeItem(KEY);
  } catch {
    // ignore unavailable storage
  }
};

let taken;

// The saved prompt ({ prompt, studioMode, projectId }) or null. Read once per
// page load and removed, so it is restored only once; later calls return the
// same value (React StrictMode runs state initialisers twice).
export const takePromptForSignIn = () => {
  if (taken !== undefined) return taken;
  taken = null;
  try {
    const raw = safeStorage('local')?.getItem(KEY);
    clearPromptForSignIn();
    const saved = raw ? JSON.parse(raw) : null;
    if (
      saved
      && typeof saved.prompt === 'string'
      && saved.prompt.trim()
      && Number.isFinite(saved.savedAt)
      && Date.now() - saved.savedAt < MAX_AGE_MS
    ) {
      taken = {
        prompt: saved.prompt,
        studioMode: typeof saved.studioMode === 'string' ? saved.studioMode : null,
        projectId: typeof saved.projectId === 'string' ? saved.projectId : null,
      };
    }
  } catch {
    taken = null;
  }
  return taken;
};
