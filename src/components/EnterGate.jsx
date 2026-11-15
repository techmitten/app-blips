import { ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { WHATS_NEW } from '../lib/whatsNew';
import { enableUiSound, playBlip } from '../lib/uiSound';
import { CURRENT_VERSION } from '../lib/updates';

// The page shown on every load before the studio picker. Browsers keep audio
// locked until a real click, so the Enter click is the gesture that lets the
// picker's hover sounds play from the first hover. It doubles as a place for
// "What's new" notes (lib/whatsNew.js).
const BURST_MS = 320;

export default function EnterGate({ onEnter }) {
  const buttonRef = useRef(null);
  const [entering, setEntering] = useState(false);
  useEffect(() => { buttonRef.current?.focus(); }, []);

  const enter = () => {
    if (entering) return;
    setEntering(true);
    // Starts audio inside the click, then confirms with a blip.
    enableUiSound().then((running) => { if (running) playBlip(0); });
    setTimeout(onEnter, BURST_MS);
  };

  return (
    <div className="studio-choice enter-gate relative flex-1 min-h-0 overflow-y-auto">
      <div className="studio-glow pointer-events-none absolute inset-0" aria-hidden="true" />
      <span className="studio-logo enter-brand">
        <img src="/favicon.svg" alt="" aria-hidden="true" className="studio-logo-icon" />
        <img src="/appblips-wordmark-dark.svg" alt="AppBlips" className="studio-logo-img studio-logo-dark" />
        <img src="/appblips-wordmark-light.svg" alt="" aria-hidden="true" className="studio-logo-img studio-logo-light" />
      </span>
      <div className="relative flex min-h-full flex-col">
      <main className="relative flex-1">
        <div className="enter-panel">
        <div className="enter-stage">
          <img src="/favicon.svg" alt="" aria-hidden="true" className="enter-mark" />
          <button
            ref={buttonRef}
            type="button"
            onClick={enter}
            className={`enter-btn studio-focus${entering ? ' is-entering' : ''}`}
          >
            <span className="enter-ring" aria-hidden="true" />
            Enter
            <span className="enter-btn-icon" aria-hidden="true"><ArrowRight size={18} /></span>
          </button>
          <p className="enter-caption">Entering turns on interface sounds. You can mute them any time in the studio.</p>
        </div>

        {WHATS_NEW.length > 0 && (
          <section aria-labelledby="enter-whats-new" className="enter-notes-wrap">
            <h2 id="enter-whats-new" className="enter-notes-title">What&rsquo;s new</h2>
            <ul className="enter-notes">
              {WHATS_NEW.map((note) => (
                <li key={note.text}>
                  {note.text}
                </li>
              ))}
            </ul>
          </section>
        )}
        </div>
      </main>
      <footer className="enter-footer">
        <nav aria-label="Legal" className="flex items-center gap-x-5">
          <a href="https://www.appblips.com/privacy" target="_blank" rel="noopener noreferrer" className="studio-nav-link studio-focus rounded-md px-1">
            Privacy Policy
          </a>
          <a href="https://www.appblips.com/terms" target="_blank" rel="noopener noreferrer" className="studio-nav-link studio-focus rounded-md px-1">
            Terms of Service
          </a>
        </nav>
        <p>&copy; 2026 TechMitten LLC. v{CURRENT_VERSION}</p>
      </footer>
      </div>
    </div>
  );
}
