import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen, PanelLeftClose, PanelLeftOpen, Settings,
  CircleHelp, MessageSquare, MessageSquarePlus, Plug, Menu, X, Github, ShieldCheck, ScrollText,
  History, Compass, Sun, Moon, DoorOpen, Power, ChevronDown,
  AppWindow, Globe, Gamepad2, FolderUp, LayoutGrid, Megaphone,
} from 'lucide-react';
import { DOCS_URL, GITHUB_URL, DISCORD_URL } from '../lib/constants';
import { SHORTCUT_HINTS } from '../lib/shortcuts';
import { isDesktop, desktopBridge } from '../lib/desktop';
import { safeStorage } from '../lib/config';
import DiscordIcon from './DiscordIcon';
import FeedbackModal from './FeedbackModal';
import FreeAccountControl from './FreeAccountControl';

const MAX_RECENTS = 5;
const PRIVACY_URL = 'https://www.appblips.com/privacy';
const TERMS_URL = 'https://www.appblips.com/terms';

// The three studios a new project can start in. On the home page the key of
// the studio you are in is marked current; in a workspace each one starts a
// new project there.
const STUDIOS = [
  { key: 'app', Icon: AppWindow, label: 'New app', tip: 'New mobile & web app', menuLabel: 'Mobile & web app' },
  { key: 'website', Icon: Globe, label: 'New website', tip: 'New responsive website', menuLabel: 'Responsive website' },
  { key: 'game', Icon: Gamepad2, label: 'New game', tip: 'New browser game', menuLabel: 'Browser game' },
];
const SAVED_OPEN_KEY = 'appblips-rail-saved-open';

// Whether the desktop rail's Saved apps list is shown. Open unless the user
// has folded it away.
const loadSavedOpen = () => {
  try {
    return safeStorage('local')?.getItem(SAVED_OPEN_KEY) !== 'false';
  } catch {
    return true;
  }
};

const saveSavedOpen = (open) => {
  try {
    safeStorage('local')?.setItem(SAVED_OPEN_KEY, String(open));
  } catch {
    // Storage unavailable: the choice just doesn't persist.
  }
};

// Side rail of the studio shell (HeroLanding), shown from the home page
// through the whole build. Expanded (icon + label, plus a Recents list) or
// collapsed to an icon-only strip; below `lg` it folds into a compact top bar
// with a slide-out menu. It holds the ways to begin (a new app, website or
// game, Import, Explore), Tour (the part for the page you are on) and, once a
// build exists (`workspaceActive`), the workspace controls: History, Exit
// and (desktop) Quit, plus the
// Chat/Preview switch and new-chat key in the mobile top bar.
function RailItem({ icon: Icon, label, tip = label, collapsed, onClick, href, badge = null, primary = false, active = false, tour, tipKey, ariaPressed, ariaExpanded, ariaControls, ariaCurrent }) {
  const className = `hero-rail-item${primary ? ' hero-rail-item-primary' : ''}${active ? ' hero-rail-item-active' : ''}${collapsed ? ' is-collapsed' : ''}`;
  const content = (
    <>
      <Icon size={17} aria-hidden="true" className="shrink-0" />
      <span className="hero-rail-label hidden lg:inline">{label}</span>
      {badge}
    </>
  );
  // The tooltip only earns its place when the label is hidden.
  const tipProps = { 'data-tip': tip, 'data-tip-side': 'right', 'data-tour': tour, 'data-tip-key': tipKey };
  if (href) {
    return (
      <a href={href} draggable={false} target="_blank" rel="noopener noreferrer" className={className} aria-label={label} {...tipProps}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} aria-label={label} aria-pressed={ariaPressed} aria-expanded={ariaExpanded} aria-controls={ariaControls} aria-current={ariaCurrent} {...tipProps}>
      {content}
    </button>
  );
}

export default function HeroSidebar({
  collapsed,
  pinned = false,
  onToggleCollapsed,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onKeyDown,
  peeking = false,
  studioMode = null,
  onNewProject,
  onImportSite,
  onOpenShowcase,
  whatsNewOpen = false,
  onToggleWhatsNew,
  onOpenApps,
  savedAppsCount = 0,
  recents = [],
  currentProjectId = null,
  onLoadProject,
  onOpenSettings,
  onOpenExtensions,
  freeAccount = null,
  workspaceActive = false,
  versionsCount = 0,
  isHistoryOpen = false,
  onToggleHistory,
  onStartTour,
  resolvedTheme = 'dark',
  onToggleTheme,
  onExit,
  mobileView,
  onMobileViewChange,
  onNewChat,
  canNewChat = false,
}) {
  const recentProjects = recents.slice(0, MAX_RECENTS);

  // Desktop: with the rail open, Saved apps folds the saved list in and out
  // right here; collapsed to icons (or with nothing saved) it opens the
  // Saved apps window as before.
  const [savedOpen, setSavedOpen] = useState(loadSavedOpen);
  const savedInline = !collapsed && recents.length > 0;
  const savedListShown = savedInline && savedOpen;
  const handleSavedClick = () => {
    if (!savedInline) {
      onOpenApps?.();
      return;
    }
    setSavedOpen((open) => {
      saveSavedOpen(!open);
      return !open;
    });
  };

  // On the home page the studio you are in is the current one.
  const currentStudio = workspaceActive || whatsNewOpen ? null : studioMode;

  // Slide-out menu below lg.
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);
  // Closes first so a modal (Settings, Saved apps) doesn't open over the panel.
  const fromMenu = (fn) => () => { setMenuOpen(false); fn?.(); };
  const themeTip = resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  const ThemeIcon = resolvedTheme === 'dark' ? Sun : Moon;

  return (
    <>
    {/* On desktop the slot holds the rail's place in the layout (icon width,
        or full width when pinned) and the rail is positioned inside it, so a
        hover peek floats over the stage instead of pushing it aside. Below lg
        the slot is `display: contents` and the rail is the top bar. */}
    <div className={`hero-rail-slot${pinned ? ' is-pinned' : ''}`}>
    <aside
      className={`hero-rail shrink-0 flex flex-row lg:flex-col items-center lg:items-stretch gap-1 px-2 py-2 lg:px-2.5 lg:py-3 ${collapsed ? 'lg:w-15' : 'lg:w-56'}${peeking ? ' is-peeking' : ''}`}
      aria-label="Studio navigation"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      <div className={`hero-rail-brand flex items-center gap-2 px-1.5 ${collapsed ? 'is-collapsed' : ''}`}>
        <span className="hero-rail-brand-mark flex items-center gap-2 min-w-0">
          <img src="/favicon.svg" alt="" aria-hidden="true" width={24} height={24} className="h-6 w-6 shrink-0" />
          {/* Two wordmarks, one per theme. Fades out smoothly when the desktop rail collapses to icons. */}
          <span className="hero-rail-wordmark">
            <img src="/appblips-wordmark-dark.svg" alt="AppBlips" width={1203} height={276} className="hero-rail-wordmark-img studio-logo-dark" />
            <img src="/appblips-wordmark-light.svg" alt="" aria-hidden="true" width={1203} height={276} className="hero-rail-wordmark-img studio-logo-light" />
          </span>
        </span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="hero-rail-toggle hidden lg:inline-flex"
          aria-label={pinned ? 'Unpin side panel' : 'Pin side panel open'}
          aria-pressed={pinned}
          data-tip={pinned ? 'Unpin side panel' : 'Pin side panel open'}
          data-tip-side="right"
        >
          {pinned ? <PanelLeftClose size={16} aria-hidden="true" /> : <PanelLeftOpen size={16} aria-hidden="true" />}
        </button>
      </div>

      {/* Below lg the workspace shows one pane at a time; the Chat/Preview
          switch and the new-chat key ride in this top bar. */}
      {workspaceActive && onMobileViewChange && (
        <div
          className="header-view-switch nav-segmented-group nav-segmented-compact lg:hidden min-w-0 flex-1 max-w-56 ml-auto"
          role="group"
          aria-label="Workspace view"
        >
          <button
            type="button"
            onClick={() => onMobileViewChange('chat')}
            aria-pressed={mobileView === 'chat'}
            className={`nav-segmented-btn flex-1 text-xs uppercase tracking-wider font-bold ${mobileView === 'chat' ? 'nav-segmented-btn-active' : ''}`}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => onMobileViewChange('preview')}
            aria-pressed={mobileView === 'preview'}
            className={`nav-segmented-btn flex-1 text-xs uppercase tracking-wider font-bold ${mobileView === 'preview' ? 'nav-segmented-btn-active' : ''}`}
          >
            Preview
          </button>
        </div>
      )}

      <div className="ml-auto flex items-center gap-1 lg:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="hero-menu-btn"
          data-tour="menu"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="hero-mobile-menu"
        >
          <Menu size={18} aria-hidden="true" />
        </button>
      </div>

      <nav className="hidden lg:flex flex-col items-stretch gap-1 lg:flex-1 min-h-0" aria-label="Studio actions">
        {/* The ways to begin, one block so the home tour can point at it. */}
        <div className="flex flex-col items-stretch gap-1" data-tour="start">
        {STUDIOS.map(({ key, Icon, label, tip }) => (
          <RailItem
            key={key}
            icon={Icon}
            label={label}
            tip={tip}
            collapsed={collapsed}
            onClick={() => onNewProject?.(key)}
            active={currentStudio === key}
            ariaCurrent={currentStudio === key ? 'page' : undefined}
          />
        ))}
        {onImportSite && (
          <RailItem icon={FolderUp} label="Import a site" tip="Import an HTML page, a website .zip or a React + Vite project" collapsed={collapsed} onClick={onImportSite} />
        )}
        </div>
        <span className="hero-rail-sep" role="separator" />
        <RailItem
          icon={FolderOpen}
          label="Saved apps"
          tip="My saved projects"
          tipKey={SHORTCUT_HINTS.apps}
          tour="apps"
          collapsed={collapsed}
          onClick={handleSavedClick}
          ariaExpanded={savedInline ? savedOpen : undefined}
          ariaControls={savedInline ? 'hero-rail-saved' : undefined}
          badge={savedAppsCount > 0 ? (
            <>
              <span className="hero-rail-count hidden lg:inline-flex">{savedAppsCount}</span>
              <ChevronDown size={14} aria-hidden="true" className={`hero-rail-chevron${savedOpen ? ' is-open' : ''}`} />
            </>
          ) : null}
        />
        {recents.length > 0 && (
          <div
            id="hero-rail-saved"
            className={`hero-rail-saved hidden lg:flex${savedListShown ? '' : ' is-collapsed'}`}
            inert={!savedListShown}
            aria-hidden={!savedListShown}
          >
            <ul className="hero-rail-saved-inner chat-scrollbar flex flex-col gap-0.5 min-h-0" aria-label="Saved apps">
              {recents.map((project) => {
                const current = project.id === currentProjectId;
                return (
                  <li key={project.id}>
                    <button
                      type="button"
                      onClick={() => onLoadProject?.(project)}
                      className={`hero-rail-recent${current ? ' is-current' : ''}`}
                      aria-current={current ? 'true' : undefined}
                      title={project.name}
                    >
                      <span className="truncate">{project.name}</span>
                    </button>
                  </li>
                );
              })}
              <li>
                <button type="button" onClick={onOpenApps} className="hero-rail-recent hero-rail-manage">
                  <span className="truncate">Manage saved apps</span>
                </button>
              </li>
            </ul>
          </div>
        )}

        {workspaceActive && (
          <RailItem
            icon={History}
            label="History"
            tip={isHistoryOpen ? 'Hide history drawer' : 'Show history drawer'}
            tour="history"
            collapsed={collapsed}
            onClick={onToggleHistory}
            active={isHistoryOpen}
            ariaPressed={isHistoryOpen}
            badge={versionsCount > 0 ? <span className="hero-rail-dot" aria-hidden="true" /> : null}
          />
        )}
        {onOpenShowcase && (
          <RailItem icon={LayoutGrid} label="Explore" tip="See what others built with AppBlips" collapsed={collapsed} onClick={onOpenShowcase} />
        )}
        <span className="hidden lg:block lg:flex-1" aria-hidden="true" />

        {onStartTour && (
          <RailItem icon={Compass} label="Tour" tip={workspaceActive ? 'Take the workspace tour' : 'Take the tour of the basics'} tour="tour" collapsed={collapsed} onClick={onStartTour} />
        )}
        {onToggleWhatsNew && (
          <RailItem icon={Megaphone} label="What’s New" tip="Updates and announcements" collapsed={collapsed} onClick={onToggleWhatsNew} active={whatsNewOpen} ariaPressed={whatsNewOpen} />
        )}
        <RailItem icon={Plug} label="Extensions" collapsed={collapsed} onClick={onOpenExtensions} />
        <RailItem icon={Settings} label="Settings" tour="settings" collapsed={collapsed} onClick={onOpenSettings} />
        <RailItem icon={MessageSquare} label="Feedback" collapsed={collapsed} onClick={() => setFeedbackOpen(true)} />
        <RailItem icon={CircleHelp} label="Help" tip="Open the AppBlips docs" tipKey={SHORTCUT_HINTS.help} tour="help" collapsed={collapsed} href={DOCS_URL} />
        <RailItem icon={ThemeIcon} label={resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'} tip={themeTip} collapsed={collapsed} onClick={onToggleTheme} />
        {workspaceActive && (
          <>
            <span className="hero-rail-sep" role="separator" />
            <RailItem icon={DoorOpen} label="Exit" tip="Close this project and go to the home page" collapsed={collapsed} onClick={onExit} />
            {isDesktop && (
              <RailItem icon={Power} label="Quit" tip="Quit AppBlips" collapsed={collapsed} onClick={() => desktopBridge.app.quit()} />
            )}
          </>
        )}
        <FreeAccountControl account={freeAccount} variant="rail" collapsed={collapsed} />
        {/* Community and legal links, only while the rail shows labels. */}
        <div className={`hero-rail-links${collapsed ? ' is-collapsed' : ''}`} inert={collapsed} aria-hidden={collapsed}>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="AppBlips on GitHub" title="AppBlips on GitHub">
            <Github size={14} aria-hidden="true" />
          </a>
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" aria-label="Join the AppBlips Discord" title="Join the AppBlips Discord">
            <DiscordIcon size={14} />
          </a>
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">Privacy</a>
          <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">Terms</a>
        </div>
      </nav>
    </aside>
    </div>

    {/* Mobile slide-out menu (below lg). Always mounted so it can animate;
        `inert` keeps the closed panel out of tab order. Its panel styles live
        in studio-choice.css. */}
    <div className="hero-menu lg:hidden" data-open={menuOpen}>
      <div className="studio-menu-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      <aside id="hero-mobile-menu" className="studio-menu-panel" aria-label="Menu" inert={!menuOpen}>
        <div className="studio-menu-head">
          <span className="text-sm font-semibold">Menu</span>
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="hero-menu-btn">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="studio-menu-list">
          {freeAccount?.state?.required && (
            <>
              <p className="studio-menu-heading">Account</p>
              <FreeAccountControl account={freeAccount} variant="studio-menu" onBeforeAction={() => setMenuOpen(false)} />
              <div className="studio-menu-sep" role="separator" />
            </>
          )}
          <p className="studio-menu-heading">New project</p>
          {STUDIOS.map(({ key, Icon, menuLabel }) => (
            <button
              key={key}
              type="button"
              className="studio-menu-item"
              aria-current={currentStudio === key ? 'page' : undefined}
              onClick={fromMenu(() => onNewProject?.(key))}
            >
              <Icon size={18} aria-hidden="true" /> {menuLabel}
            </button>
          ))}
          {onImportSite && (
            <button type="button" className="studio-menu-item" onClick={fromMenu(onImportSite)}>
              <FolderUp size={18} aria-hidden="true" /> Import a site
            </button>
          )}
          <div className="studio-menu-sep" role="separator" />
          <p className="studio-menu-heading">Workspace</p>
          {workspaceActive && canNewChat && onNewChat && (
            <button type="button" className="studio-menu-item" onClick={fromMenu(onNewChat)}>
              <MessageSquarePlus size={18} aria-hidden="true" /> New chat
            </button>
          )}
          <button type="button" className="studio-menu-item" onClick={fromMenu(onOpenApps)}>
            <FolderOpen size={18} aria-hidden="true" /> Projects{savedAppsCount > 0 ? ` (${savedAppsCount})` : ''}
          </button>
          {workspaceActive && (
            <button type="button" className="studio-menu-item" aria-expanded={isHistoryOpen} onClick={fromMenu(onToggleHistory)}>
              <History size={18} aria-hidden="true" /> History{versionsCount > 0 ? ` (${versionsCount})` : ''}
            </button>
          )}
          {onOpenShowcase && (
            <button type="button" className="studio-menu-item" onClick={fromMenu(onOpenShowcase)}>
              <LayoutGrid size={18} aria-hidden="true" /> Explore
            </button>
          )}
          {recentProjects.length > 0 && (
            <>
              <div className="studio-menu-sep" role="separator" />
              <p className="studio-menu-heading">Recents</p>
              {recentProjects.map((project) => (
                <button key={project.id} type="button" className="studio-menu-item" onClick={fromMenu(() => onLoadProject?.(project))}>
                  <span className="truncate">{project.name}</span>
                </button>
              ))}
            </>
          )}
          <div className="studio-menu-sep" role="separator" />
          <p className="studio-menu-heading">Preferences</p>
          <button type="button" className="studio-menu-item" onClick={fromMenu(onOpenExtensions)}>
            <Plug size={18} aria-hidden="true" /> Extensions
          </button>
          <button type="button" className="studio-menu-item" onClick={fromMenu(onOpenSettings)}>
            <Settings size={18} aria-hidden="true" /> Settings
          </button>
          <button type="button" className="studio-menu-item" onClick={fromMenu(onToggleTheme)}>
            <ThemeIcon size={18} aria-hidden="true" /> {resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
          <div className="studio-menu-sep" role="separator" />
          <p className="studio-menu-heading">Help &amp; Feedback</p>
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className="studio-menu-item" onClick={fromMenu()}>
            <CircleHelp size={18} aria-hidden="true" /> Help
          </a>
          {onStartTour && (
            <button type="button" className="studio-menu-item" onClick={fromMenu(onStartTour)}>
              <Compass size={18} aria-hidden="true" /> Take the tour
            </button>
          )}
          {onToggleWhatsNew && (
            <button type="button" className="studio-menu-item" onClick={fromMenu(onToggleWhatsNew)}>
              <Megaphone size={18} aria-hidden="true" /> What’s New
            </button>
          )}
          <button type="button" className="studio-menu-item" onClick={fromMenu(() => setFeedbackOpen(true))}>
            <MessageSquare size={18} aria-hidden="true" /> Send feedback
          </button>
          <div className="studio-menu-sep" role="separator" />
          <p className="studio-menu-heading">Community</p>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="studio-menu-item" onClick={fromMenu()}>
            <Github size={18} aria-hidden="true" /> GitHub
          </a>
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="studio-menu-item" onClick={fromMenu()}>
            <DiscordIcon size={18} /> Discord
          </a>
          <div className="studio-menu-sep" role="separator" />
          <p className="studio-menu-heading">Legal</p>
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="studio-menu-item" onClick={fromMenu()}>
            <ShieldCheck size={18} aria-hidden="true" /> Privacy Policy
          </a>
          <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="studio-menu-item" onClick={fromMenu()}>
            <ScrollText size={18} aria-hidden="true" /> Terms of Service
          </a>
          {workspaceActive && (
            <>
              <div className="studio-menu-sep" role="separator" />
              <button type="button" className="studio-menu-item" aria-label="Exit to the home page" onClick={fromMenu(onExit)}>
                <DoorOpen size={18} aria-hidden="true" /> Exit
              </button>
              {isDesktop && (
                <button type="button" className="studio-menu-item" aria-label="Quit AppBlips" onClick={() => desktopBridge.app.quit()}>
                  <Power size={18} aria-hidden="true" /> Quit App
                </button>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
    {feedbackOpen && createPortal(
      <FeedbackModal onClose={() => setFeedbackOpen(false)} />,
      document.body,
    )}
    </>
  );
}
