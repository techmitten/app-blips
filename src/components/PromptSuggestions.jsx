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
        className="group flex items-center gap-1.5 mb-1.5 rounded-md text-[11px] font-semibold text-slate-500 transition-colors cursor-pointer hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-white/55 dark:hover:text-white"
      >
        <Sparkles size={12} className="text-indigo-500 dark:text-indigo-300" aria-hidden="true" />
        <span>Suggested next{collapsed ? ` (${suggestions.length})` : ''}</span>
        <ChevronDown
          size={12}
          aria-hidden="true"
          className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}
        />
      </button>
      {!collapsed && (
        <ul id="prompt-suggestions-list" aria-label="Suggested prompts" className="flex flex-col gap-1.5">
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
      )}
    </div>
  );
}
