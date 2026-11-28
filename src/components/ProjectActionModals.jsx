import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { isProjectNameTaken } from '../lib/projectsStorage';

const projectLabel = (project) => project.name || 'Untitled App';

// Escape closes the dialog unless it is busy saving.
function useEscapeToClose(onClose, busy) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || busy) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, busy]);
}

// Rename a saved project. `onRename(project, name)` resolves to a success
// bool; the dialog closes itself on success.
export function RenameProjectModal({ project, projects = [], onRename, onClose }) {
  const [name, setName] = useState(projectLabel(project));
  const [busy, setBusy] = useState(false);
  useEscapeToClose(onClose, busy);

  const trimmed = name.trim();
  const nameTaken = isProjectNameTaken(projects, trimmed, project.id);
  const unchanged = trimmed === projectLabel(project);
  const canSave = Boolean(trimmed) && !nameTaken && !busy;

  const save = async (event) => {
    event?.preventDefault();
    if (!canSave) return;
    if (unchanged) {
      onClose();
      return;
    }
    setBusy(true);
    const ok = await onRename(project, trimmed);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <ConfirmModal
      title="Rename project"
      onClose={onClose}
      onConfirm={save}
      confirmLabel="Rename"
      busyLabel="Renaming..."
      busy={busy}
      confirmDisabled={!canSave}
      icon={Pencil}
      confirmClass={`inline-flex items-center gap-1.5 rounded-lg px-5 py-2 font-semibold transition-colors active:scale-[0.98] ${
        canSave
          ? 'brand-fill-text bg-brand text-white hover:bg-brand-hover shadow-sm'
          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
      }`}
    >
      <form onSubmit={save} className="space-y-2">
        <label htmlFor="rename-project-input" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Project name
        </label>
        <input
          id="rename-project-input"
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.target.select()}
          aria-invalid={nameTaken}
          className={`w-full bg-slate-50 border rounded-lg px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none transition-all focus:ring-2 ${
            nameTaken ? 'border-red-500 focus:ring-red-500/30' : 'border-slate-200 focus:ring-blue-500 focus:border-blue-500'
          }`}
        />
        {nameTaken && (
          <p className="text-xs text-red-600" role="alert">You already have a project with this name. Pick a different one.</p>
        )}
      </form>
    </ConfirmModal>
  );
}

// Delete a saved project after confirmation. `onDelete(project)` resolves to
// a success bool; the dialog closes itself on success.
export function DeleteProjectModal({ project, isCurrent = false, onDelete, onClose }) {
  const [busy, setBusy] = useState(false);
  useEscapeToClose(onClose, busy);

  const confirm = async () => {
    setBusy(true);
    const ok = await onDelete(project);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <ConfirmModal
      title="Delete project"
      subtitle="This cannot be undone."
      onClose={onClose}
      onConfirm={confirm}
      confirmLabel="Delete"
      busyLabel="Deleting..."
      busy={busy}
      icon={Trash2}
      confirmClass={`inline-flex items-center gap-1.5 rounded-lg px-5 py-2 font-semibold transition-all ${
        busy ? 'bg-red-200 text-white cursor-not-allowed' : 'bg-danger text-white hover:bg-danger-hover'
      }`}
    >
      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-slate-600 leading-relaxed">
        Delete <span className="font-bold text-slate-900">{projectLabel(project)}</span> and all of its versions?
      </div>
      {isCurrent && (
        <p className="text-xs font-medium text-slate-500">
          This project is currently open. Deleting it will clear the current workspace.
        </p>
      )}
    </ConfirmModal>
  );
}
