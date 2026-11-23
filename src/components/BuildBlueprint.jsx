import { useEffect, useRef, useState } from 'react';
import { Code2, EyeOff, FileCode2 } from 'lucide-react';
import ThinkingElapsed from './ThinkingElapsed';

// The AppBlips mark draws itself while the build runs: the wave strokes in
// with the coral dot riding its tip, then unwinds, on a loop. Paths are the
// ones in public/favicon.svg.
const LOGO_TILE = 'M118 0H394C477.4 0 512 34.6 512 118V394C512 477.4 477.4 512 394 512H118C34.6 512 0 477.4 0 394V118C0 34.6 34.6 0 118 0Z';
const LOGO_WAVE = 'M106 296C146 166 206 166 246 252S348 346 382 214';
const LOGO_DOT = { x: 388, y: 196, r: 46 };
// The dot is smaller while it rides the stroke, then grows to its logo size.
const RIDING_DOT_R = 30;

const STEPS = ['Understanding your idea', 'Reasoning', 'Writing the code', 'Checking for errors', 'Finishing up'];
const REASONING = 1;
const CHECKING = 3;

// How far the build has got, from the signals the overlay already has. The
// caller keeps the furthest value, so a repair pass inside "Writing" must not
// un-tick earlier steps. "Writing" needs real code (or, without a code stream
// to watch, any status past analysing), so the first moments of a request
// aren't mislabelled as writing before the model has produced anything.
function rawStage({ isThinking, status, hasCode, canSeeCode }) {
  const s = (status || '').toLowerCase();
  if (s.startsWith('writing a summary')) return 4;
  if (s.includes('syntax') || s.includes('fixing') || s.includes('verifying') || s.includes('checking')) return CHECKING;
  if (hasCode) return 2;
  if (isThinking) return REASONING;
  if (s.startsWith('analyzing')) return 0;
  if (!canSeeCode && s) return 2;
  return 0;
}

// Draws the mark and then reverses it, on a loop for as long as the build
// runs. A cosine ping-pong slows to a stop at both ends, so the turn at the
// top (logo complete) and at the bottom (empty) is seamless. Near the top the
// dot leaves the stroke's tip and settles into its place in the logo.
// `visible` restarts the loop when the logo comes back after Show code.
const LOOP_MS = 3600;
function useLogoDraw(visible) {
  const waveRef = useRef(null);
  const dotRef = useRef(null);

  useEffect(() => {
    const wave = waveRef.current;
    const dot = dotRef.current;
    if (!wave || !dot) return undefined;
    const length = wave.getTotalLength();
    wave.style.strokeDasharray = String(length);
    const place = (drawn) => {
      wave.style.strokeDashoffset = String(length * (1 - drawn));
      const tip = wave.getPointAtLength(length * drawn);
      // 0 while riding the stroke, 1 once settled; eased over the last 12%.
      const k = Math.min(1, Math.max(0, (drawn - 0.88) / 0.12));
      const settle = k * k * (3 - 2 * k);
      dot.setAttribute('cx', String(tip.x + (LOGO_DOT.x - tip.x) * settle));
      dot.setAttribute('cy', String(tip.y + (LOGO_DOT.y - tip.y) * settle));
      dot.setAttribute('r', String(RIDING_DOT_R + (LOGO_DOT.r - RIDING_DOT_R) * settle));
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      place(1);
      return undefined;
    }
    const start = performance.now();
    let frame = 0;
    const draw = (now) => {
      place((1 - Math.cos(((now - start) / LOOP_MS) * 2 * Math.PI)) / 2);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  return { waveRef, dotRef };
}

// Replaces the plain spinner while a build runs: the AppBlips logo drawing
// itself, the current step with a row of progress pips and a quiet footer. The raw code stays one click away
// (`codeSlot`), since some people like watching it. Presentational only: it
// reads the stream text through a ref and never touches generatedCode.
export default function BuildBlueprint({
  isTouch = false,
  isThinking = false,
  thinkingSince = null,
  status = null,
  page = null,
  codeRef = null,
  codeSlot = null,
}) {
  const [chars, setChars] = useState(0);
  const [lines, setLines] = useState(0);
  const [showCode, setShowCode] = useState(false);
  const [furthest, setFurthest] = useState(0);
  // The Reasoning step is listed only once the model has actually reasoned, so
  // builds with reasoning off don't tick a step that never happened.
  const [hasReasoned, setHasReasoned] = useState(false);

  // Five reads a second is plenty for the line counter.
  useEffect(() => {
    if (!codeRef) return undefined;
    const id = setInterval(() => {
      const text = codeRef.current || '';
      setChars((prev) => (prev === text.length ? prev : text.length));
      let n = 0;
      for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n += 1;
      setLines((prev) => (prev === n ? prev : n));
    }, 200);
    return () => clearInterval(id);
  }, [codeRef]);

  if (isThinking && !hasReasoned) setHasReasoned(true);
  const next = rawStage({ isThinking, status, hasCode: chars > 0 || Boolean(page?.page), canSeeCode: Boolean(codeRef) });
  if (next > furthest) setFurthest(next);
  // The model reasons again before each tool-calling turn, so "Reasoning" is
  // the active step whenever it is thinking, until the build reaches checks
  // (a repair pass that thinks stays on "Checking for errors").
  const stage = isThinking && furthest < CHECKING ? REASONING : furthest;

  const fileName = page?.page || 'index.html';
  const { waveRef, dotRef } = useLogoDraw(!(showCode && codeSlot));

  const detail = (index) => {
    if (index !== stage) return null;
    if (index === REASONING && isThinking) return <><ThinkingElapsed since={thinkingSince} /> elapsed</>;
    if (index === 2 && page?.page) {
      return page.total > 1 ? `${page.page} · page ${page.step} of ${page.total}` : page.page;
    }
    if (status && status !== 'Synthesizing your app from your prompt.') return status;
    return null;
  };

  // Reasoning is listed only once the model has actually reasoned.
  const visibleSteps = STEPS.map((_, i) => i).filter((i) => i !== REASONING || hasReasoned);
  const currentDetail = detail(stage);

  return (
    <div className={`build-blueprint${isTouch ? '' : ' is-wide'}${showCode && codeSlot ? ' is-code' : ''}`} role="status" aria-live="polite">
      {showCode && codeSlot ? (
        // An editor window around the stream: the file being written and a
        // numbered gutter (LiveCodePeek sets the line counter).
        <div className="build-blueprint-code">
          <div className="build-blueprint-code-bar" aria-hidden="true">
            <span className="build-blueprint-code-lights"><i /><i /><i /></span>
            <span key={fileName} className="build-blueprint-code-tab">
              <FileCode2 size={12} />
              {fileName}
            </span>
          </div>
          <div className="build-blueprint-code-screen">{codeSlot}</div>
        </div>
      ) : (
        <div className="build-blueprint-frame" aria-hidden="true">
          <svg className="build-blueprint-logo" viewBox="0 0 512 512">
            <path className="build-blueprint-logo-tile" d={LOGO_TILE} />
            <path className="build-blueprint-logo-track" d={LOGO_WAVE} />
            <path ref={waveRef} className="build-blueprint-logo-wave" d={LOGO_WAVE} />
            <circle ref={dotRef} className="build-blueprint-logo-dot" cx="106" cy="296" r={RIDING_DOT_R} />
          </svg>
        </div>
      )}

      {/* Only the current step is named, centred, so step names of different
          lengths never leave a ragged edge. The pips show where it is in the
          sequence; each carries its step name for screen readers. */}
      <div className="build-blueprint-steps">
        <p key={STEPS[stage]} className="build-blueprint-now">{STEPS[stage]}</p>
        {/* Always rendered, so the pips below don't jump as details come and go. */}
        <p key={String(currentDetail ?? '')} className="build-blueprint-step-detail">{currentDetail || '\u00a0'}</p>
        <ol className="build-blueprint-pips" aria-label={`Step ${visibleSteps.indexOf(stage) + 1} of ${visibleSteps.length}`}>
          {visibleSteps.map((i) => {
            const state = i < stage ? 'done' : i === stage ? 'active' : 'todo';
            return (
              <li key={STEPS[i]} className={`build-blueprint-pip is-${state}`} aria-current={state === 'active' ? 'step' : undefined}>
                <span className="sr-only">{STEPS[i]}{state === 'done' ? ', done' : ''}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="build-blueprint-footer">
        {codeRef && lines > 0 && <span className="tabular-nums">{lines.toLocaleString()} lines</span>}
        {codeRef && codeSlot && (
          <button type="button" className="build-blueprint-toggle" onClick={() => setShowCode((v) => !v)} aria-pressed={showCode}>
            {showCode ? <EyeOff size={12} aria-hidden="true" /> : <Code2 size={12} aria-hidden="true" />}
            {showCode ? 'Hide code' : 'Show code'}
          </button>
        )}
      </div>
    </div>
  );
}
