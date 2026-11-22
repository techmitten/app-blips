import { useEffect, useRef, useState } from 'react';
import '../styles/app/hero-landing.css';
import '../styles/app/starter-ideas.css';
import { TriangleAlert, RotateCcw, X } from 'lucide-react';
import HeroSidebar from './HeroSidebar';
import PromptInput from './PromptInput';
import StarterIdeas from './StarterIdeas';

const COPY = {
  ask: {
    title: 'Ask AI any question.',
    subtitle: 'Ask about your app, or anything else.',
  },
  website: {
    title: 'What website should we build?',
    subtitle: 'Describe your site, then click to edit it.',
  },
  game: {
    title: 'What game should we build?',
    subtitle: 'Describe the game, then play it right here.',
  },
  app: {
    title: 'What should we build?',
    subtitle: "Describe your app in plain words. We'll build it.",
  },
};

// The studio shell shown after the studio pick: a side rail plus a rounded,
// brand-colored stage. Before the first prompt the stage holds one centered
// composer (HeroPrompt); once a build exists App passes the workspace (chat,
// history drawer and preview) as `workspace` and the stage shows that instead.
// The shell itself stays mounted across the hand-off, so the rail keeps its
// state and the screen never changes underneath the user. It owns no
// generation state -- prompt, attachment and mode all live in App and are
// shared with the workspace composer, so nothing typed here is lost.
// `theme` is the app's resolved theme: dark keeps the near-black coral look,
// light mirrors the studio picker (see hero-landing.css).
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
  starterIdeas,
  starterSampleSize,
  onPickStarter,
  error,
  interruptedJob,
  onRetryInterruptedJob,
  onDismissInterruptedJob,
  workspace = null,
  isResuming = false,
  ...sidebarProps
}) {
  const [railPinned, setRailPinned] = useState(false);
  const [railHovered, setRailHovered] = useState(false);
  const hoverCloseTimerRef = useRef(null);
  const railCollapsed = !railPinned && !railHovered;
  const toggleRailPinned = () => {
    setRailPinned((prev) => !prev);
  };
  const handleRailMouseEnter = () => {
    clearTimeout(hoverCloseTimerRef.current);
    setRailHovered(true);
  };
  const handleRailMouseLeave = () => {
    clearTimeout(hoverCloseTimerRef.current);
    hoverCloseTimerRef.current = setTimeout(() => {
      setRailHovered(false);
    }, 200);
  };
  useEffect(() => () => clearTimeout(hoverCloseTimerRef.current), []);

  const copy = COPY[chatMode === 'ask' ? 'ask' : COPY[studioMode] ? studioMode : 'app'];
  const workspaceActive = Boolean(workspace);

  return (
    <div className={`hero-landing${theme === 'light' ? '' : ' dark force-dark'}${workspaceActive ? ' hero-landing-workspace' : ''} flex-1 min-h-0 min-w-0 flex flex-col lg:flex-row`}>
      <HeroSidebar
        collapsed={railCollapsed}
        pinned={railPinned}
        onToggleCollapsed={toggleRailPinned}
        onMouseEnter={handleRailMouseEnter}
        onMouseLeave={handleRailMouseLeave}
        workspaceActive={workspaceActive}
        resolvedTheme={theme}
        {...sidebarProps}
      />

      <div className="flex-1 min-h-0 min-w-0 flex px-1.5 pb-1.5 lg:pl-0 lg:pt-1.5">
        {workspaceActive ? (
          <div className="hero-stage hero-stage-workspace flex-1 min-w-0 min-h-0 flex">
            {workspace}
          </div>
        ) : (
        <main className="hero-stage hero-stage-first flex-1 min-w-0 overflow-y-auto chat-scrollbar animate-fade-in">
          {!isResuming && (
            <div className="hero-column mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center gap-4 px-4 sm:px-6">
              <div className="mb-4 flex flex-col items-center gap-2.5 text-center animate-stagger-1">
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
                  chatMode={chatMode}
                  onChatModeChange={onChatModeChange}
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

              <div className="w-full animate-stagger-3">
                <StarterIdeas
                  variant="chips"
                  ideas={starterIdeas}
                  sampleSize={starterSampleSize}
                  onPick={(starter) => onPickStarter(starter.prompt)}
                />
              </div>
            </div>
          )}
        </main>
        )}
      </div>
    </div>
  );
}
