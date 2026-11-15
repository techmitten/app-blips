// Tiny synthesized UI sounds (no audio files): a soft "blip" for hovering
// options on the studio picker.
//
// Browsers keep audio locked until the page gets a real user gesture (click,
// tap or key press; hover does not count) unless they already trust the site.
// `unlockUiSound` runs from app start, so it is satisfied by the earliest
// gesture or trust signal and every hover after that plays.

let context = null;
let lastPlayed = 0;

// Muting is remembered across visits. Storage can throw (private windows,
// blocked site data); sound then just stays on for the session.
export const UI_SOUND_MUTED_KEY = 'orion-ui-sound-muted';
let muted = (() => {
  try { return localStorage.getItem(UI_SOUND_MUTED_KEY) === 'true'; } catch { return false; }
})();

export const isUiSoundMuted = () => muted;

export function setUiSoundMuted(value) {
  muted = Boolean(value);
  try { localStorage.setItem(UI_SOUND_MUTED_KEY, String(muted)); } catch { /* keep the in-memory value */ }
}

function getContext() {
  if (context) return context;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    context = new AudioContextClass();
  } catch {
    return null;
  }
  return context;
}

// Call once at app start (not from the picker, so a click anywhere earlier in
// the session already counts). Tries to start the context straight away, which
// works when the browser already trusts the site (returning visitors, installed
// apps, desktop), and otherwise resumes it on the first real gesture. Returns
// a cleanup.
const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'click', 'keydown', 'touchend'];
export function unlockUiSound() {
  let done = false;
  const detach = () => GESTURE_EVENTS.forEach((name) => window.removeEventListener(name, unlock, { capture: true }));
  function unlock() {
    if (done) return;
    const ctx = getContext();
    if (!ctx) { done = true; detach(); return; }
    if (ctx.state === 'running') { done = true; detach(); return; }
    ctx.resume().then(() => {
      if (ctx.state === 'running') { done = true; detach(); }
    }).catch(() => {});
  }
  GESTURE_EVENTS.forEach((name) => window.addEventListener(name, unlock, { capture: true, passive: true }));
  unlock();
  return detach;
}

// A short, quiet sine blip. `pitch` shifts it in semitones so neighbouring
// options can sound slightly different.
export function playBlip(pitch = 0) {
  if (muted) return;
  const ctx = getContext();
  if (!ctx || ctx.state !== 'running') return;
  // Sweeping the mouse across several rows shouldn't machine-gun.
  const now = ctx.currentTime;
  if (now - lastPlayed < 0.04) return;
  lastPlayed = now;

  const frequency = 880 * 2 ** (pitch / 12);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, now);
  osc.frequency.exponentialRampToValueAtTime(frequency * 1.25, now + 0.05);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.09);
}
