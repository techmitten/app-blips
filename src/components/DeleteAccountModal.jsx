import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

/**
 * Confirmation dialog for permanently deleting the user's Clerk account.
 */
export default function DeleteAccountModal({ accountLabel = '', onDelete, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || 'Could not delete your account. Try again or use the Account dashboard.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmModal
      title="Delete your account?"
      subtitle={accountLabel || undefined}
      onClose={() => { if (!busy) onClose(); }}
      onConfirm={handleConfirm}
      confirmLabel="Delete account"
      busyLabel="Deleting…"
      busy={busy}
      confirmClass="inline-flex items-center gap-1.5 rounded-lg px-5 py-2 font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
    >
      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-slate-600 leading-relaxed flex items-start gap-3">
        <TriangleAlert size={18} className="text-red-500 shrink-0 mt-0.5" />
        <span>
          Your sign-in account will be permanently deleted and you will be signed out. Apps saved in this browser stay here unless you delete them separately.
        </span>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600 leading-snug">
          {error}
        </p>
      )}
    </ConfirmModal>
  );
}
