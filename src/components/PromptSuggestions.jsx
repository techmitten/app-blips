import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

// Row of AI-suggested next prompts above the chat box (Settings → AI →
// Suggested prompts). The suggestions come with each build (stored on the
// version, see generatePromptSuggestions in llm.js); clicking one puts it in
// the prompt box to edit or send, like the starter ideas. The row scrolls
// sideways: touch and trackpads natively, a mouse wheel through onWheel, and
// the edges fade only where there is more to see.
export default function PromptSuggestions({ suggestions, onPick }) {
  const rowRef = useRef(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const updateEdges = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return undefined;
    el.scrollLeft = 0;
    updateEdges();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateEdges);
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [suggestions, updateEdges]);

  // A plain mouse wheel only scrolls vertically; turn it sideways here, since
  // the row is the only thing that can scroll under the pointer.
  const handleWheel = (event) => {
    const el = rowRef.current;
    if (!el || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    el.scrollLeft += event.deltaY;
  };

  if (!suggestions?.length) return null;

  return (
    <div className="prompt-suggestions flex items-center gap-2 mb-2.5 animate-fade-in">
      <span
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-500/15"
        title="Suggested next prompts"
        aria-hidden="true"
      >
        <Sparkles size={14} />
      </span>
      <div
        ref={rowRef}
        role="group"
        aria-label="Suggested prompts"
        onScroll={updateEdges}
        onWheel={handleWheel}
        data-fade-start={edges.start || undefined}
        data-fade-end={edges.end || undefined}
        className="prompt-suggestions-row flex-1 min-w-0 flex items-center gap-2 overflow-x-auto py-0.5"
      >
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            title={suggestion}
            className="shrink-0 max-w-[18rem] truncate rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/80 dark:hover:border-indigo-400/40 dark:hover:bg-indigo-500/15 dark:hover:text-white"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
