import '../styles/app/hero-landing.css';
import '../styles/app/studio-choice.css';
import '../styles/app/starter-ideas.css';
import { useEffect, useRef, useState } from 'react';
import { TriangleAlert, RotateCcw, X, Smartphone, AppWindow, Gamepad2 } from 'lucide-react';
import HeroSidebar from './HeroSidebar';
import PromptInput from './PromptInput';
import WhatsNew from './WhatsNew';
import Aurora from './reactbits/Aurora';
import useHeroRail from '../hooks/useHeroRail';

// Each studio has its own light, so the page says which one you are in:
// App warm coral (the app icon's), Website clear sky blue, Game violet to
// pink with a mint edge.
const AURORA_COLORS = {
  app: ['#ff8a6b', '#ffb36b', '#f2667a'],
  website: ['#5ea8ff', '#7dd3fc', '#8b8cff'],
  game: ['#a78bfa', '#f472b6', '#5eead4'],
};

// The selected studio key's tint: [icon and edge, second wash stop], taken
// from the studio's aurora but chosen so the three keys read apart. Game leads
// with the aurora's pink (its violet sat too close to Website's blue), and
// Website keeps to sky blue.
const SWITCH_TINT = {
  app: [AURORA_COLORS.app[0], AURORA_COLORS.app[2]],
  website: [AURORA_COLORS.website[0], AURORA_COLORS.website[1]],
  game: [AURORA_COLORS.game[1], AURORA_COLORS.game[0]],
};

// The light theme's moving backdrop: React Bits' Aurora drawn as soft pastel
// light (lightMode) hanging from the top of the stage, in the studio's
// colours (AURORA_COLORS). Rendered at 1x pixel density: the light
// is all soft gradients, so a sharper canvas would only cost GPU time. It
// leans gently toward the pointer, pauses itself when hidden or offscreen,
// and holds still for reduced motion.
const AURORA_PROPS = {
  lightMode: true,
  direction: 'top',
  height: 0.34,
  amplitude: 0.9,
  blend: 0.8,
  glow: 0.7,
  scale: 0.8,
  speed: 0.45,
  layers: 2,
  opacity: 0.55,
  dpr: 1,
};

// The studio switch inside the composer's footer: three quiet icon keys, one
// click to move between the studios on the home page without opening the
// side rail. Same action as the rail's New app / New website / New game keys.
// Named by the plain `title`: a styled tooltip would be clipped by the dock.
const STUDIO_SWITCH = [
  { key: 'app', Icon: Smartphone, label: 'App studio' },
  { key: 'website', Icon: AppWindow, label: 'Website studio' },
  { key: 'game', Icon: Gamepad2, label: 'Game studio' },
];

// Switching studio fades the aurora from one studio's colours to the next
// instead of snapping. Only this wrapper re-renders while it fades; Aurora
// picks the new stops up on its next frame. Reduced motion switches at once.
const AURORA_FADE_MS = 900;
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
const mixStops = (from, to, t) => to.map((stop, i) => {
  const a = hexToRgb(from[i] || stop);
  const b = hexToRgb(stop);
  return rgbToHex(a.map((c, k) => c + (b[k] - c) * t));
});

function StudioAurora({ colors }) {
  const [stops, setStops] = useState(colors);
  // The stops on screen right now, so a switch made mid-fade starts from
  // wherever the last fade had got to.
  const shownRef = useRef(colors);
  useEffect(() => {
    const from = shownRef.current;
    if (from.join() === colors.join()) return undefined;
    const duration = prefersReducedMotion() ? 0 : AURORA_FADE_MS;
    let raf = 0;
    const start = performance.now();
    const step = (now) => {
      const t = duration ? Math.min(1, Math.max(0, (now - start) / duration)) : 1;
      const next = t < 1 ? mixStops(from, colors, t * t * (3 - 2 * t)) : colors;
      shownRef.current = next;
      setStops(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [colors]);
  return <Aurora {...AURORA_PROPS} colorStops={stops} />;
}

const prefersReducedMotion = () => (
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
);

// One subtitle for every studio, like the heading, so switching studios
// never reflows the page above the composer.
const SUBTITLE = 'Describe it in plain words, then try it right here.';

const COPY = {
  website: {
    eyebrow: 'Website Studio',
    title: 'What should we build?',
    subtitle: SUBTITLE,
  },
  game: {
    eyebrow: 'Game Studio',
    title: 'What should we build?',
    subtitle: SUBTITLE,
  },
  app: {
    eyebrow: 'App Studio',
    title: 'What should we build?',
    subtitle: SUBTITLE,
  },
};

// The studio shell and the app's home page: a side rail plus a rounded,
// brand-colored stage. Before the first prompt the stage holds one centered
// composer for the current studio (the rail switches studios); once a build
// exists App passes the workspace (chat, history drawer and preview) as
// `workspace` and the stage shows that instead. What's New (from the rail)
// covers the stage without unmounting what is under it.
// The shell itself stays mounted across the hand-off, so the rail keeps its
// state and the screen never changes underneath the user. It owns no
// generation state -- prompt, attachment and mode all live in App and are
// shared with the workspace composer, so nothing typed here is lost.
// `theme` is the app's resolved theme (see hero-landing.css).
export default function HeroLanding({
  studioMode = 'app',
  theme = 'dark',
  chatMode,
  onChatModeChange,
  prompt,
  onPromptChange,
  onSubmit,
  onCancelGeneration,
  isGenerating,
  attachment,
  attachmentError,
  isCapturingScreenshot,
  onAttachScreenshot,
  onAttachFile,
  onRemoveAttachment,
  webSearchAvailable = false,
  webSearchProvider = '',
  webSearch = false,
  onWebSearchChange,
  error,
  interruptedJob,
  onRetryInterruptedJob,
  onDismissInterruptedJob,
  workspace = null,
  isResuming = false,
  ...sidebarProps
}) {
  const rail = useHeroRail();

  // The home page always builds (App resets Ask on the way here); Build/Ask
  // is in the workspace, so there is no Ask copy.
  const copy = COPY[COPY[studioMode] ? studioMode : 'app'];
  const workspaceActive = Boolean(workspace);

  // What's New: Escape or Back closes it and puts focus back where it was.
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const whatsNewRef = useRef(null);
  useEffect(() => {
    if (!showWhatsNew) return undefined;
    const returnFocus = document.activeElement;
    whatsNewRef.current?.querySelector('.whats-new-back')?.focus({ preventScroll: true });
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (event.target.closest?.('[role="dialog"]')) return;
      setShowWhatsNew(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      returnFocus?.focus?.({ preventScroll: true });
    };
  }, [showWhatsNew]);
  const closeWhatsNewThen = (fn) => (fn ? (...args) => { setShowWhatsNew(false); return fn(...args); } : fn);

  return (
    <div className={`hero-landing${theme === 'light' ? '' : ' dark force-dark'}${workspaceActive ? ' hero-landing-workspace' : ''} flex-1 min-h-0 min-w-0 flex flex-col lg:flex-row`}>
      <HeroSidebar
        {...rail}
        workspaceActive={workspaceActive}
        resolvedTheme={theme}
        studioMode={studioMode}
        {...sidebarProps}
        onNewProject={closeWhatsNewThen(sidebarProps.onNewProject)}
        onLoadProject={closeWhatsNewThen(sidebarProps.onLoadProject)}
        chatMode={chatMode}
        onChatModeChange={onChatModeChange}
        isGenerating={isGenerating}
        whatsNewOpen={showWhatsNew}
        onToggleWhatsNew={() => setShowWhatsNew((open) => !open)}
      />

      <div className="relative flex-1 min-h-0 min-w-0 flex px-1.5 pb-1.5 lg:pl-0 lg:pt-1.5">
        {showWhatsNew && (
          <div
            ref={whatsNewRef}
            className="hero-stage studio-choice hero-whats-new top-0 right-1.5 bottom-1.5 left-1.5 lg:left-0 lg:top-1.5 chat-scrollbar animate-fade-in"
          >
            <WhatsNew onBack={() => setShowWhatsNew(false)} />
          </div>
        )}
        {workspaceActive ? (
          <div className="hero-stage hero-stage-workspace flex-1 min-w-0 min-h-0 flex">
            {workspace}
          </div>
        ) : (
        <main className="hero-stage hero-stage-first flex-1 min-w-0 overflow-y-auto chat-scrollbar animate-fade-in">
          {/* Aurora light behind the composer (light theme only; hero-landing.css). */}
          {theme === 'light' && (
            <div className="hero-aurora" aria-hidden="true">
              <StudioAurora colors={AURORA_COLORS[studioMode] || AURORA_COLORS.app} />
            </div>
          )}
          {!isResuming && (
            <p className="hero-crumbs">
              <span className="hero-crumbs-current">{copy.eyebrow}</span>
            </p>
          )}
          {!isResuming && (
            <div className="hero-column mx-auto flex min-h-full w-full max-w-2xl flex-col items-stretch justify-center gap-4 px-4 sm:px-6">
              <div className="hero-heading animate-stagger-1">
                <h1 className="hero-title">{copy.title}</h1>
                <p className="hero-subtitle">{copy.subtitle}</p>
              </div>

              <div className="hero-composer w-full animate-stagger-2">
                <PromptInput
                  prompt={prompt}
                  onPromptChange={onPromptChange}
                  onSubmit={onSubmit}
                  onCancelGeneration={onCancelGeneration}
                  isGenerating={isGenerating}
                  isChatActive={false}
                  hasCode={false}
                  chatMode="build"
                  isClarifying={false}
                  studioMode={studioMode}
                  attachment={attachment}
                  attachmentError={attachmentError}
                  isCapturingScreenshot={isCapturingScreenshot}
                  onAttachScreenshot={onAttachScreenshot}
                  onAttachFile={onAttachFile}
                  onRemoveAttachment={onRemoveAttachment}
                  webSearchAvailable={webSearchAvailable}
                  webSearchProvider={webSearchProvider}
                  webSearch={webSearch}
                  onWebSearchChange={onWebSearchChange}
                  voiceInput
                  footerExtra={sidebarProps.onNewProject ? (
                    <div className="hero-studio-switch" role="group" aria-label="Studio" data-tour="studios">
                      {STUDIO_SWITCH.map(({ key, Icon, label }) => (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={studioMode === key}
                          aria-label={label}
                          title={label}
                          onClick={() => { if (studioMode !== key) sidebarProps.onNewProject(key); }}
                          className="hero-studio-switch-btn"
                          style={{ '--studio-a': SWITCH_TINT[key][0], '--studio-b': SWITCH_TINT[key][1] }}
                        >
                          <Icon size={16} aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                />
              </div>

              {interruptedJob && (
                <div role="alert" className="w-full rounded-2xl border border-amber-300 bg-amber-50/90 dark:border-amber-300/30 dark:bg-amber-500/15 p-3.5 backdrop-blur-sm animate-fade-in">
                  <div className="flex items-start gap-2.5">
                    <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-200" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-100">The last build was interrupted</p>
                      <p className="truncate text-xs font-medium text-amber-950/80 dark:text-white/75" title={interruptedJob.prompt}>
                        &ldquo;{interruptedJob.prompt}&rdquo;
                      </p>
                      <button
                        type="button"
                        onClick={onRetryInterruptedJob}
                        className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-100 dark:border-amber-300/40 dark:bg-amber-400/20 px-3 py-1.5 text-xs font-bold text-amber-900 dark:text-amber-50 transition-colors hover:bg-amber-200 dark:hover:bg-amber-400/30"
                      >
                        <RotateCcw size={11} aria-hidden="true" />
                        Retry
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={onDismissInterruptedJob}
                      className="shrink-0 cursor-pointer rounded-lg p-1 text-amber-700 dark:text-amber-200 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                      aria-label="Dismiss"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div role="alert" className="w-full rounded-2xl border border-rose-200 bg-rose-50/90 dark:border-rose-300/30 dark:bg-rose-500/20 p-3.5 backdrop-blur-sm animate-fade-in">
                  <div className="flex items-start gap-2.5">
                    <TriangleAlert size={16} className="mt-0.5 shrink-0 text-rose-700 dark:text-rose-200" aria-hidden="true" />
                    <div>
                      <p className="text-[13px] font-semibold text-rose-900 dark:text-rose-100">Something went wrong</p>
                      <p className="text-xs font-medium leading-snug text-rose-950/80 dark:text-white/75">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              <p className="hero-kbd-hint animate-stagger-3" aria-hidden="true">
                <span>Press <kbd>Enter</kbd> to {chatMode === 'ask' ? 'send' : 'build'}</span>
                <span className="hero-kbd-sep" />
                <span><kbd>Shift</kbd> + <kbd>Enter</kbd> for new line</span>
              </p>
            </div>
          )}
        </main>
        )}
      </div>
    </div>
  );
}
