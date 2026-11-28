import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

const MENU_WIDTH = 160;
const GAP = 4;

// The ⋯ key at the end of a saved-project row in the side rail, and the small
// Rename / Delete menu it opens. The menu is portaled to <body> with fixed
// positioning so the rail's scrolling list can't clip it; it stays in the
// rail's React tree, so hovering it keeps a peeking rail open.
// `data-hero-rail-popover` tells the rail's focus tracking it still counts as
// inside the rail.
export default function ProjectRowMenu({ project, open, onOpenChange, onRename, onDelete }) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const name = project.name || 'Untitled App';

  const close = (refocus = true) => {
    onOpenChange(false);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  };

  // Place below the key, or above it when there isn't room. Set on the node
  // directly before paint, so it never shows in the wrong spot.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!open || !menu || !rect) return;
    const below = rect.bottom + GAP;
    const top = below + menu.offsetHeight > window.innerHeight - 8 ? rect.top - GAP - menu.offsetHeight : below;
    const left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8);
    menu.style.top = `${Math.max(8, top)}px`;
    menu.style.left = `${Math.max(8, left)}px`;
  }, [open]);

  // Focus the first item once placed; close on outside press, scroll or resize.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      onOpenChangeRef.current(false);
    };
    const onDismiss = () => onOpenChangeRef.current(false);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onDismiss);
    window.addEventListener('scroll', onDismiss, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onDismiss);
      window.removeEventListener('scroll', onDismiss, true);
    };
  }, [open]);

  const onMenuKeyDown = (event) => {
    const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])];
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      // Handled here so the rail's own Escape (fold a peek) doesn't also fire.
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  const choose = (fn) => () => {
    close(false);
    fn();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`hero-rail-recent-more${open ? ' is-open' : ''}`}
        aria-label={`More actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${name}`}
          data-hero-rail-popover=""
          onKeyDown={onMenuKeyDown}
          className="fixed z-[80] rounded-xl border border-slate-200 bg-surface p-1 shadow-xl animate-fade-in"
          style={{ width: MENU_WIDTH, top: -9999, left: -9999 }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={choose(onRename)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
          >
            <Pencil size={14} aria-hidden="true" /> Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={choose(onDelete)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none"
          >
            <Trash2 size={14} aria-hidden="true" /> Delete
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
