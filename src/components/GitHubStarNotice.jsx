import { Github, Star, X } from 'lucide-react';
import { GITHUB_REPO_URL } from '../lib/githubStarPrompt';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './SettingControls';

export default function GitHubStarNotice({ onDismiss }) {
  return (
    <aside
      aria-label="Support AppBlips on GitHub"
      className="fixed top-4 right-4 z-[55] w-[calc(100%-2rem)] max-w-sm rounded-xl border border-slate-200 bg-surface p-4 shadow-xl text-sm text-slate-700"
    >
      <div className="flex items-start gap-3">
        <Star size={20} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div role="status">
            <p className="font-semibold text-slate-900">Enjoying AppBlips?</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              You’ve created a few projects! Give us a star on GitHub to support AppBlips and help others discover it.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" onClick={onDismiss} className={PRIMARY_BUTTON}>
              <Github size={14} aria-hidden="true" /> Star on GitHub
            </a>
            <button type="button" onClick={onDismiss} className={SECONDARY_BUTTON}>No thanks</button>
          </div>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss GitHub star request" className="rounded-lg p-1 -m-1 text-slate-400 hover:text-slate-700 transition-colors">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
