import { useEffect, useState } from 'react';

// A "Test connection" button sends a real request (to a model, which on Free
// is at AppBlips' expense, or to the user's script), so a finished test locks
// the button for a short while. The time is kept outside the component, per
// kind of test, so closing and reopening Settings doesn't reset it.
export const TEST_COOLDOWN_MS = 10_000;
const nextTestAt = {};

// `kind` groups buttons that share one cooldown (e.g. 'ai' for Settings → AI
// and the setup screen). Returns the seconds left, and `start` to call when a
// test finishes.
export default function useTestCooldown(kind) {
  const [now, setNow] = useState(Date.now);
  const waiting = (nextTestAt[kind] || 0) > now;
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [waiting]);
  return {
    secondsLeft: waiting ? Math.ceil((nextTestAt[kind] - now) / 1000) : 0,
    start: () => { nextTestAt[kind] = Date.now() + TEST_COOLDOWN_MS; setNow(Date.now()); },
  };
}
