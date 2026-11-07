import { TriangleAlert, RotateCcw, X, Plus, History, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import StarterIdeas from './StarterIdeas';
import ChatTranscript from './ChatTranscript';
import PromptInput from './PromptInput';
import { displayBuildPrompt } from '../lib/buildMessages';

// The pane's open width at lg+, shared with the animated wrapper in App.
export const BUILD_PANE_WIDTH = 'lg:w-[clamp(320px,35vw,420px)]';

// Left-hand prompt/chat pane: studio header, starter ideas, chat transcript and
// the fixed bottom input area (prompt). The generation flow and
// all state live in App; this is presentational composition.
export default function BuildPanel({
  isChatActive,
  chatMode,
  studioMode = 'app',
  generatedCode,
  showStarterIdeas,
  starterIdeas,
  starterSampleSize,
  onPickStarter,
  versions,
  currentVersionIndex,
  chatContextStartIndex = 0,
  pendingPrompt,
  pendingAttachment = null,
  streamingReply,
  isGenerating,
  generationStatus = null,
  thinkingSince = null,
  error,
  prompt,
  onPromptChange,
  onSubmit,
  onCancelGeneration,
  onChatModeChange,
  onNewChat,
  isHistoryOpen = false,
  onToggleHistory,
  onRewind,
  canOfferReview = false,
  onReview,
  onSkipReview,
  canOfferFix = false,
  onFixReview,
  onSkipFix,
  onApproveImages,
  gallery = null,
  projectId = null,
  chatBottomRef,
  interruptedJob = null,
  onRetryInterruptedJob,
  onDismissInterruptedJob,
  attachment = null,
  attachmentError = null,
  isCapturingScreenshot = false,
  onAttachScreenshot,
  onAttachFile,
  onRemoveAttachment,
  planWebSearch = null,
  webSearch = false,
  onWebSearchChange,
  side = 'left',
  isCollapsed = false,
  onToggleCollapsed,
}) {
  const isClarifying = chatMode === 'build' && versions[currentVersionIndex]?.editMode === 'clarify';
  const CollapseIcon = side === 'right' ? PanelRightClose : PanelLeftClose;
  const ExpandIcon = side === 'right' ? PanelRightOpen : PanelLeftOpen;
  // The toggle sits on the pane's outer edge (next to the window edge), so
  // when the pane shrinks to the rail the expand button lands where the
  // collapse button was. Collapsing is a wide-layout (lg+) feature only:
  // narrower screens switch between chat and preview instead.
  const collapseButton = onToggleCollapsed && (
    <button
      type="button"
      onClick={onToggleCollapsed}
      className={`build-panel-collapse hidden lg:inline-flex items-center justify-center rounded-lg p-1.5 text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer ${side === 'right' ? 'ml-2' : '-ml-1.5 mr-1.5'}`}
      aria-label="Collapse build pane"
      aria-expanded="true"
      title="Collapse build pane"
    >
      <CollapseIcon size={20} aria-hidden="true" />
    </button>
  );

  return (
    <>
    {/* Collapsed rail (lg+ only), layered over the pane's outer edge. It is
        always mounted so it can cross-fade with the pane; `invisible` (which
        flips only once the fade-out ends) keeps it out of the tab order and
        the accessibility tree while the pane is open. */}
    <div
      className={`build-panel-rail absolute inset-0 z-30 hidden lg:flex flex-col items-center bg-surface border-slate-200/80 dark:border-white/10 transition-[opacity,visibility] duration-150 ease-out motion-reduce:transition-none ${side === 'right' ? 'border-l' : 'border-r'} ${isCollapsed ? 'opacity-100 visible delay-75' : 'opacity-0 invisible pointer-events-none'}`}
    >
      <div className="build-panel-header w-full shrink-0 flex items-center justify-center border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#14161f]">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Expand build pane"
          aria-expanded="false"
          title="Expand build pane"
        >
          <ExpandIcon size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
    {/* Fixed-width frame: while the wrapper in App animates its width, the
        pane keeps its full width and is clipped instead of reflowing its text
        every frame. The frame (not .build-panel) carries the width because
        .build-panel's `zoom` would scale a fixed width past the wrapper's. The
        pane stays mounted when collapsed, so the chat scroll position and the
        composer survive. */}
    <div
      className={`build-panel-frame h-full w-full ${BUILD_PANE_WIDTH} lg:shrink-0 min-w-0 min-h-0 flex transition-[opacity,visibility] duration-150 ease-out motion-reduce:transition-none ${isCollapsed ? 'lg:opacity-0 lg:invisible' : 'delay-75'}`}
    >
    <div
      className="build-panel h-full w-full min-h-0 overflow-hidden flex flex-col bg-surface z-20 shrink-0 relative @container border-b md:border-b-0 md:border-r border-slate-200/80 dark:border-white/10"
    >
      {/* Subtle atmospheric gradient */}
      <div className={`absolute inset-0 pointer-events-none z-0 prompt-atmosphere ${!isChatActive ? 'prompt-atmosphere-hero' : ''}`} />

      {/* Studio Panel Header Bar — aligns horizontally with PreviewPane's header */}
      <div className="build-panel-header relative h-14 sm:h-16 shrink-0 flex items-center justify-between px-4 sm:px-5 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#14161f] shadow-xs z-10">
        <div className="flex items-center">
          {side !== 'right' && collapseButton}
          <h2 className="build-panel-title text-sm font-semibold text-slate-900 dark:text-white">Build</h2>
        </div>
        {/* Quick actions */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={onToggleHistory}
            className={`history-header-toggle mr-2 inline-flex items-center justify-center rounded-lg p-1.5 transition-colors cursor-pointer ${isHistoryOpen ? 'text-indigo-500 dark:text-white bg-indigo-50 dark:bg-white/15' : 'text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'}`}
            aria-label={isHistoryOpen ? 'Hide history' : 'Show history'}
            aria-expanded={isHistoryOpen}
            title={isHistoryOpen ? 'Hide history' : 'Show history'}
          >
            <History size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            data-tour="newchat"
            onClick={onNewChat}
            disabled={isGenerating}
            className="new-chat-btn inline-flex items-center justify-center p-1.5 rounded-lg text-slate-900 dark:text-white hover:text-slate-600 dark:hover:text-white/80 hover:scale-110 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            aria-label="New chat (keeps version history)"
            title="New chat (keeps version history)"
          >
            <Plus size={20} strokeWidth={3} aria-hidden="true" />
          </button>
          {side === 'right' && collapseButton}
        </div>
      </div>

      <div className="build-panel-scroll flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 sm:py-5 md:mr-1.5 flex flex-col relative z-1 chat-scrollbar">
        <div className={`build-panel-stage w-full max-w-xl mx-auto space-y-4 animate-fade-in ${isChatActive ? 'mt-auto' : 'mt-4 sm:mt-8 mb-auto'}`}>

          {/* Empty-state intro: the brand blips carry the mark, and the
              product's own mechanism is the headline. No card here — the
              composer below is the single surface on this screen. */}
          {!isChatActive && (
            <div className="hero-intro relative space-y-3">
              <span className="hero-blips" aria-hidden="true">
                <span className="hero-blip hero-blip-cyan" />
                <span className="hero-blip hero-blip-brand" />
                <span className="hero-blip hero-blip-coral" />
              </span>

              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white leading-[1.08]">
                {chatMode === 'ask' ? (
                  <>Ask anything.<br />Build nothing.</>
                ) : studioMode === 'website' ? (
                  <>Prompt in.<br />Website out.</>
                ) : studioMode === 'game' ? (
                  <>Prompt in.<br />Game out.</>
                ) : (
                  <>Prompt in.<br />App out.</>
                )}
              </h2>

              <p className="text-slate-700 dark:text-white/80 text-sm font-medium leading-relaxed max-w-[44ch]">
                {chatMode === 'ask'
                  ? 'Get a straight answer about your app, or anything else.'
                  : studioMode === 'website'
                    ? "Describe the website you want in plain words. We'll build a working version in seconds — then click any element in the preview to edit it."
                    : studioMode === 'game'
                      ? "Describe the game you want in plain words. We'll build a playable version in seconds — controls, score, and all."
                      : "Describe the app you want in plain words. We'll build a working version in seconds — interactive, and it saves your data."}
              </p>
            </div>
          )}

          {/* Starter Prompts */}
          {showStarterIdeas && (
            <StarterIdeas
              ideas={starterIdeas}
              sampleSize={starterSampleSize}
              onPick={(starter) => onPickStarter(starter.prompt)}
            />
          )}

          {(versions.length > 0 || pendingPrompt) && (
            <>
              {interruptedJob && (
                <div role="alert" className="select-text bg-amber-50/90 border border-amber-200 p-3.5 rounded-2xl shadow-xs backdrop-blur-sm animate-fade-in">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-amber-100 rounded-xl text-amber-700 border border-amber-200/80 shrink-0 mt-0.5 shadow-2xs">
                      <TriangleAlert size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-[10px] font-bold text-amber-800 uppercase tracking-[0.14em] mb-0.5">Build interrupted</p>
                      <p className="text-xs text-amber-950 font-semibold leading-snug truncate" title={displayBuildPrompt(interruptedJob)}>
                        &ldquo;{displayBuildPrompt(interruptedJob)}&rdquo;
                      </p>
                    </div>
                    <button
                      onClick={onDismissInterruptedJob}
                      className="p-1 rounded-lg text-amber-600 hover:bg-amber-100/80 transition-colors shrink-0 cursor-pointer"
                      aria-label="Dismiss"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div className="mt-2.5 pl-8">
                    <button
                      onClick={onRetryInterruptedJob}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-100/90 hover:bg-amber-200 border border-amber-300/80 transition-all px-3 py-1.5 rounded-xl cursor-pointer shadow-2xs"
                    >
                      <RotateCcw size={11} />
                      Retry
                    </button>
                  </div>
                </div>
              )}
              <ChatTranscript
                versions={versions}
                currentVersionIndex={currentVersionIndex}
                startIndex={chatContextStartIndex}
                pendingPrompt={pendingPrompt}
                pendingAttachment={pendingAttachment}
                streamingReply={streamingReply}
                isGenerating={isGenerating}
                generationStatus={generationStatus}
                thinkingSince={thinkingSince}
                chatMode={chatMode}
                studioMode={studioMode}
                chatBottomRef={chatBottomRef}
                onRewind={onRewind}
                canOfferReview={canOfferReview}
                onReview={onReview}
                onSkipReview={onSkipReview}
                canOfferFix={canOfferFix}
                onFixReview={onFixReview}
                onSkipFix={onSkipFix}
                onApproveImages={chatMode === 'build' ? onApproveImages : undefined}
                gallery={gallery}
                projectId={projectId}
              />
            </>
          )}

          {error && (
            <div role="alert" className="select-text bg-rose-50/90 border border-rose-200 p-3.5 rounded-2xl shadow-xs backdrop-blur-sm animate-fade-in">
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 bg-rose-100 rounded-xl text-rose-700 border border-rose-200/80 shrink-0 shadow-2xs">
                  <TriangleAlert size={14} />
                </div>
                <div>
                  <p className="font-mono text-[10px] font-bold text-rose-800 uppercase tracking-[0.14em] mb-0.5">Error</p>
                  <p className="text-xs text-rose-950 font-semibold leading-snug">
                    {error}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom Input Area */}
      <div className="build-panel-composer shrink-0 p-3 sm:p-4 border-t border-slate-200/90 dark:border-white/10 bg-surface/95 backdrop-blur-xl relative z-1">
        <PromptInput
          prompt={prompt}
          onPromptChange={onPromptChange}
          onSubmit={onSubmit}
          onCancelGeneration={onCancelGeneration}
          isGenerating={isGenerating}
          isChatActive={isChatActive}
          hasCode={Boolean(generatedCode)}
          chatMode={chatMode}
          onChatModeChange={onChatModeChange}
          isClarifying={isClarifying}
          studioMode={studioMode}
          attachment={attachment}
          attachmentError={attachmentError}
          isCapturingScreenshot={isCapturingScreenshot}
          onAttachScreenshot={onAttachScreenshot}
          onAttachFile={onAttachFile}
          onRemoveAttachment={onRemoveAttachment}
          planWebSearch={planWebSearch}
          webSearch={webSearch}
          onWebSearchChange={onWebSearchChange}
        />
      </div>
    </div>
    </div>
    </>
  );
}
