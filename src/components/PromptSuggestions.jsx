import { useState } from 'react';
import { ChevronDown, CornerDownLeft, Sparkles } from 'lucide-react';
import { loadPromptSuggestionsCollapsed, savePromptSuggestionsCollapsed } from '../lib/config';

// AI-suggested next prompts above the chat box (Settings → AI → Suggested
// prompts). The suggestions come with each build (stored on the version, see
// generatePromptSuggestions in llm.js); clicking one puts it in the prompt box
// to edit or send, like the starter ideas. They are a short stacked list
// (at most MAX_SUGGESTIONS) so every one reads in full at any panel width,
// with no sideways scrolling; the header folds the list away and that choice
// is remembered.
export default function PromptSuggestions({ suggestions, onPick }) {
  const [collapsed, setCollapsed] = useState(loadPromptSuggestionsCollapsed);

  if (!suggestions?.length) return null;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    savePromptSuggestionsCollapsed(next);
  };

  return (
    <div className="prompt-suggestions mb-2.5 animate-fade-in">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls="prompt-suggestions-list"
        title={collapsed ? 'Show suggested prompts' : 'Hide suggested prompts'}
        className="group flex w-full items-center gap-1.5 rounded-md text-[11px] font-semibold text-slate-500 transition-colors cursor-pointer hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-white/55 dark:hover:text-white"
      >
        <Sparkles size={12} className="text-indigo-500 dark:text-indigo-300" aria-hidden="true" />
        <span>Suggested next{collapsed ? ` (${suggestions.length})` : ''}</span>
        <span
          aria-hidden="true"
          className="ml-auto flex size-5 items-center justify-center rounded-md text-slate-600 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-700 dark:text-white/80 dark:group-hover:bg-white/10 dark:group-hover:text-white"
        >
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ease-out motion-reduce:transition-none ${collapsed ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {/* The list stays mounted so it can animate: the 0fr/1fr grid row
          eases its height, and `inert` keeps the folded buttons out of the
          tab order and the accessibility tree. */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}
        inert={collapsed}
      >
        {/* Padding offset by negative margin so the clip box doesn't cut
            off the buttons' focus outlines. */}
        <div className="min-h-0 overflow-hidden -mx-1 px-1 -mb-1 pb-1">
          <ul id="prompt-suggestions-list" aria-label="Suggested prompts" className="flex flex-col gap-1.5 pt-1.5">
            {suggestions.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => onPick(suggestion)}
                  className="group w-full flex items-start gap-2 text-left rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium leading-snug text-slate-700 shadow-2xs transition-colors cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/80 dark:hover:border-indigo-400/40 dark:hover:bg-indigo-500/15 dark:hover:text-white"
                >
                  <span className="flex-1 min-w-0 break-words">{suggestion}</span>
                  <CornerDownLeft
                    size={12}
                    aria-hidden="true"
                    className="shrink-0 mt-0.5 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
