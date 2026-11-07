import { useEffect, useId, useRef, useState } from 'react';
import { Download, FileCode2, FolderDown } from 'lucide-react';

// The preview toolbar's single download key. With one format (websites,
// games, plain apps, imported codebases) it downloads straight away; React
// apps can also leave as a Vite project, so there it opens a menu to pick
// the HTML file or the React project. It has Publish's brand fill;
// `showLabel` (no Publish key beside it) adds the "Export" label. The menu is
// position: fixed under the key because the toolbar row clips overflow on
// narrow widths.
export default function ExportButton({ onExportHtml, onExportReactProject = null, disabled = false, showLabel = false, tip }) {
  const [menuOpen, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  const hasChoice = Boolean(onExportReactProject);
  // The menu closes by itself once the app stops being a React app (undo).
  const open = menuOpen && hasChoice;

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };
    const onResize = () => setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useEffect(() => {
    if (open && position) menuRef.current?.querySelector('[role="menuitem"]')?.focus();
  }, [open, position]);

  const onMenuKeyDown = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])];
    const at = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
        : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  const pick = (fn) => {
    close();
    fn?.();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-tour="share"
        onClick={() => (hasChoice ? toggle() : onExportHtml?.())}
        disabled={disabled}
        className={`nav-btn brand-fill-text preview-key bg-brand hover:bg-brand-hover text-white border border-transparent shadow-2xs${showLabel ? '' : ' nav-btn-icon'}`}
        aria-label={hasChoice ? 'Download' : 'Export app'}
        aria-haspopup={hasChoice ? 'menu' : undefined}
        aria-expanded={hasChoice ? open : undefined}
        aria-controls={hasChoice && open ? menuId : undefined}
        data-tip={open ? undefined : (hasChoice ? 'Download as an HTML file or a React project' : tip || 'Download this app as an HTML file')}
        data-tip-align="end"
      >
        <Download size={16} />
        {showLabel && <span className="preview-key-label">Export</span>}
      </button>
      {open && position && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Download as"
          className="insert-menu export-menu"
          style={{ top: position.top, right: position.right }}
          onKeyDown={onMenuKeyDown}
        >
          <div className="insert-menu-heading">Download as</div>
          <button type="button" role="menuitem" className="insert-menu-item export-menu-item" onClick={() => pick(onExportHtml)}>
            <FileCode2 size={16} />
            <span>
              <span className="export-menu-title">HTML file</span>
              <span className="export-menu-detail">Opens in any browser. Ready to upload or share.</span>
            </span>
          </button>
          <button type="button" role="menuitem" className="insert-menu-item export-menu-item" onClick={() => pick(onExportReactProject)}>
            <FolderDown size={16} />
            <span>
              <span className="export-menu-title">React project (.zip)</span>
              <span className="export-menu-detail">For developers. Needs Node.js and npm install to run.</span>
            </span>
          </button>
        </div>
      )}
    </>
  );
}
