import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, LogIn, LogOut, Trash2, User, UserCog } from 'lucide-react';
import DeleteAccountModal from './DeleteAccountModal';

const initialsFor = (state) => {
  const source = (state.displayName || state.email || '').trim();
  if (!source) return '';
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

const shortLabelFor = (state) => {
  const raw = (state.displayName || state.email || '').trim();
  if (!raw) return 'Signed in';
  const at = raw.indexOf('@');
  if (at > 0) return raw.slice(0, at);
  return raw;
};

function AccountAvatar({ state, size = 18 }) {
  if (state.imageUrl) {
    return (
      <img
        src={state.imageUrl}
        alt=""
        aria-hidden="true"
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = initialsFor(state);
  if (initials) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400 font-bold shrink-0"
        style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.48)) }}
      >
        {initials}
      </span>
    );
  }
  return <User size={size - 2} aria-hidden="true" className="shrink-0" />;
}

/**
 * Signed-in / Sign-in account control for headers, sidebars, and slide-out menus.
 * Renders nothing unless the server requires Clerk sign-in for Free AI.
 */
export default function FreeAccountControl({
  account,
  variant = 'header',
  collapsed = false,
  onBeforeAction = null,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const state = account?.state;
  const busy = Boolean(account?.busy);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setMenuOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    const onResize = () => setMenuOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [menuOpen]);

  if (!state?.required) return null;

  const accountLabel = state.email || state.displayName || state.name || '';
  const shortLabel = shortLabelFor(state);
  const signInError = !state.signedIn ? state.error : '';

  const runAction = async (fn) => {
    setMenuOpen(false);
    onBeforeAction?.();
    try {
      await fn?.();
    } catch {
      // Logged in useFreeSignIn
    }
  };

  const openMenu = () => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 248;
      const alignRight = variant !== 'rail';
      const left = alignRight
        ? Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width))
        : Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));
      const openAbove = variant === 'rail' && rect.top > 240;
      const top = openAbove ? undefined : Math.min(window.innerHeight - 220, rect.bottom + 8);
      const bottom = openAbove ? Math.max(8, window.innerHeight - rect.top + 8) : undefined;
      setMenuPos({ left, top, bottom, width });
    }
    setMenuOpen(true);
  };

  const requestDelete = () => {
    setMenuOpen(false);
    onBeforeAction?.();
    setConfirmDelete(true);
  };

  const deleteModal = confirmDelete ? createPortal(
    <DeleteAccountModal
      accountLabel={accountLabel}
      onDelete={account.deleteAccount}
      onClose={() => setConfirmDelete(false)}
    />,
    document.body,
  ) : null;

  if (variant === 'menu' || variant === 'studio-menu') {
    const itemClass = variant === 'studio-menu' ? 'studio-menu-item studio-focus' : 'mobile-menu-item';
    if (!state.signedIn) {
      return (
        <>
          <button
            type="button"
            onClick={() => runAction(account.signIn)}
            disabled={busy || Boolean(signInError)}
            className={itemClass}
            title={signInError || undefined}
          >
            <LogIn size={16} aria-hidden="true" />
            <span>Sign in</span>
          </button>
          {signInError && (
            <p role="alert" className="px-2 py-1 text-xs text-amber-500 dark:text-amber-400 leading-snug">
              {signInError}
            </p>
          )}
        </>
      );
    }
    return (
      <>
        <div className="px-2 py-2 rounded-lg border border-slate-200/20 bg-white/5 flex items-center gap-2.5">
          <AccountAvatar state={state} size={24} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate">{state.displayName || 'Signed in'}</p>
            {state.email && state.email !== state.displayName && (
              <p className="text-[11px] opacity-75 truncate">{state.email}</p>
            )}
          </div>
        </div>
        <button type="button" onClick={() => runAction(account.openDashboard)} disabled={busy} className={itemClass}>
          <UserCog size={16} aria-hidden="true" />
          <span>Account dashboard</span>
        </button>
        <button type="button" onClick={() => runAction(account.signOut)} disabled={busy} className={itemClass}>
          <LogOut size={16} aria-hidden="true" />
          <span>Sign out</span>
        </button>
        <button type="button" onClick={requestDelete} disabled={busy} className={`${itemClass} text-red-400 hover:text-red-300`}>
          <Trash2 size={16} aria-hidden="true" />
          <span>Delete account</span>
        </button>
        {deleteModal}
      </>
    );
  }

  const errorPopover = signInError && menuOpen && menuPos ? createPortal(
    <div
      ref={menuRef}
      role="alert"
      style={{ position: 'fixed', left: menuPos.left, top: menuPos.top, bottom: menuPos.bottom, width: menuPos.width, zIndex: 80 }}
      className="account-menu rounded-xl p-3 text-xs text-slate-700 leading-snug animate-scale-in"
    >
      <p className="font-semibold text-slate-900 mb-1">Sign-in unavailable</p>
      <p className="text-slate-600">{signInError}</p>
    </div>,
    document.body,
  ) : null;

  if (variant === 'rail') {
    if (!state.signedIn) {
      return (
        <>
          <button
            ref={triggerRef}
            type="button"
            onClick={signInError ? openMenu : () => runAction(account.signIn)}
            disabled={busy}
            aria-expanded={signInError ? menuOpen : undefined}
            className={`hero-rail-item${collapsed ? ' is-collapsed' : ''}`}
            aria-label={signInError ? `Sign in unavailable: ${signInError}` : 'Sign in'}
            data-tip={signInError || 'Sign in'}
            data-tip-side="right"
          >
            <LogIn size={17} aria-hidden="true" className="shrink-0" />
            <span className={`hero-rail-label hidden ${collapsed ? '' : 'lg:inline'}`}>Sign in</span>
          </button>
          {errorPopover}
        </>
      );
    }
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          onClick={openMenu}
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Signed in as ${accountLabel || 'user'}. Open account menu`}
          className={`hero-rail-item${collapsed ? ' is-collapsed' : ''}`}
          data-tip={`Signed in as ${accountLabel || 'user'}`}
          data-tip-side="right"
        >
          <AccountAvatar state={state} size={18} />
          <span className={`hero-rail-label hidden truncate ${collapsed ? '' : 'lg:inline'}`}>{shortLabel}</span>
        </button>
        {menuOpen && menuPos && createPortal(
          <AccountDropdown
            ref={menuRef}
            pos={menuPos}
            state={state}
            busy={busy}
            onDashboard={() => runAction(account.openDashboard)}
            onSignOut={() => runAction(account.signOut)}
            />,
          document.body,
        )}
      </>
    );
  }

  // 'header', 'header-mobile', 'topbar'
  const isTopbar = variant === 'topbar';
  const isMobile = variant === 'header-mobile';

  if (!state.signedIn) {
    const btnClass = isTopbar
      ? 'studio-ghost-btn studio-focus inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium h-9 px-2.5 max-md:hidden'
      : isMobile
        ? 'nav-btn nav-ghost nav-btn-icon shrink-0'
        : 'nav-btn nav-ghost nav-btn-icon';
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          onClick={signInError ? openMenu : () => runAction(account.signIn)}
          disabled={busy}
          aria-expanded={signInError ? menuOpen : undefined}
          className={btnClass}
          data-tip={isTopbar ? undefined : (signInError || 'Sign in to Free AI')}
          title={isTopbar ? (signInError || 'Sign in to Free AI') : undefined}
          aria-label={signInError ? `Sign in unavailable: ${signInError}` : 'Sign in to Free AI'}
        >
          <LogIn size={16} aria-hidden="true" />
          {!isMobile && <span className={isTopbar ? 'text-xs font-semibold' : 'hidden xl:inline'}>Sign in</span>}
        </button>
        {errorPopover}
      </>
    );
  }

  const triggerClass = isTopbar
    ? 'studio-ghost-btn studio-focus inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium h-9 px-2.5'
    : isMobile
      ? 'nav-btn nav-ghost nav-btn-icon shrink-0'
      : 'nav-btn nav-ghost nav-btn-icon';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openMenu}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Signed in as ${accountLabel || 'user'}. Open account menu`}
        data-tip={isTopbar ? undefined : `Signed in as ${accountLabel || 'user'}`}
        title={isTopbar ? `Signed in as ${accountLabel || 'user'}` : undefined}
        className={triggerClass}
      >
        <AccountAvatar state={state} size={18} />
        {!isMobile && (
          <span className={isTopbar ? 'hidden sm:inline max-w-28 truncate text-xs font-semibold' : 'hidden xl:inline max-w-28 truncate'}>
            {shortLabel}
          </span>
        )}
        {!isMobile && <ChevronDown size={13} aria-hidden="true" className="opacity-70 shrink-0 hidden sm:inline" />}
      </button>

      {menuOpen && menuPos && createPortal(
        <AccountDropdown
          ref={menuRef}
          pos={menuPos}
          state={state}
          busy={busy}
          onDashboard={() => runAction(account.openDashboard)}
          onSignOut={() => runAction(account.signOut)}
        />,
        document.body,
      )}
    </>
  );
}

function AccountDropdown({ ref, pos, state, busy, onDashboard, onSignOut }) {
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Account menu"
      style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 80 }}
      className="account-menu rounded-xl py-1.5 text-slate-900 animate-scale-in"
    >
      <div className="account-menu-head px-3.5 py-2.5 flex items-center gap-2.5">
        <AccountAvatar state={state} size={28} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900 truncate flex items-center gap-1.5">
            <span className="truncate">{state.displayName || 'Signed in'}</span>
          </p>
          {state.email && (
            <p className="text-[11px] text-slate-600 truncate">{state.email}</p>
          )}
          <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Signed in</p>
        </div>
      </div>

      <div className="py-1">
        <button
          type="button"
          role="menuitem"
          disabled={busy}
          onClick={onDashboard}
          className="account-menu-item w-full px-3.5 py-2 text-left text-sm flex items-center gap-2.5 transition-colors disabled:opacity-50"
        >
          <UserCog size={15} aria-hidden="true" className="shrink-0 opacity-70" />
          <span>Account dashboard</span>
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={busy}
          onClick={onSignOut}
          className="account-menu-item w-full px-3.5 py-2 text-left text-sm flex items-center gap-2.5 transition-colors disabled:opacity-50"
        >
          <LogOut size={15} aria-hidden="true" className="shrink-0 opacity-70" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}
