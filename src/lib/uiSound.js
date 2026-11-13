// Tiny synthesized UI sounds (no audio files): a soft "blip" for hovering
// options on the studio picker.
//
// Browsers keep audio locked until the page gets a real user gesture (click,
// tap or key press; hover does not count), so the first hovers on a fresh
// page are silent. `unlockUiSound` resumes the context on the first gesture
// and every hover after that plays.

let context = null;
let lastPlayed = 0;

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

// Call once from a component; returns a cleanup. Resumes the audio context on
// the first gesture so later hovers can play.
export function unlockUiSound() {
  const unlock = () => {
    const ctx = getContext();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  const events = ['pointerdown', 'keydown', 'touchstart'];
  events.forEach((name) => window.addEventListener(name, unlock, { capture: true, passive: true }));
  return () => events.forEach((name) => window.removeEventListener(name, unlock, { capture: true }));
}

// A short, quiet sine blip. `pitch` shifts it in semitones so neighbouring
// options can sound slightly different.
export function playBlip(pitch = 0) {
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
