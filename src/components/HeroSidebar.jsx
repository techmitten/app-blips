import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, FolderOpen, PanelLeftClose, PanelLeftOpen, Settings,
  CircleHelp, MessageSquare, MessageSquarePlus, Plug, Menu, X, Github, ShieldCheck, ScrollText,
  History, Compass, Sun, Moon, DoorOpen, Power,
} from 'lucide-react';
import { DOCS_URL, GITHUB_URL, DISCORD_URL } from '../lib/constants';
import { SHORTCUT_HINTS } from '../lib/shortcuts';
import { isDesktop, desktopBridge } from '../lib/desktop';
import { DiscordIcon } from './StudioChoice';
import FeedbackModal from './FeedbackModal';
import FreeAccountControl from './FreeAccountControl';

const MAX_RECENTS = 5;

// Side rail of the studio shell (HeroLanding), shown from the first prompt
// through the whole build. Expanded (icon + label, plus a Recents list) or
// collapsed to an icon-only strip; below `lg` it folds into a compact top bar
// of icon keys. Once a build exists (`workspaceActive`) it also carries the
// workspace controls: History, Tour, Exit and (desktop) Quit, plus the
// Chat/Preview switch and new-chat key in the mobile top bar.
function RailItem({ icon: Icon, label, tip = label, collapsed, onClick, href, badge = null, primary = false, active = false, tour, tipKey, ariaPressed }) {
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
    <button type="button" onClick={onClick} className={className} aria-label={label} aria-pressed={ariaPressed} {...tipProps}>
      {content}
    </button>
  );
}

export default function HeroSidebar({
  collapsed,
  onToggleCollapsed,
  onNewApp,
  onOpenApps,
  savedAppsCount = 0,
  recents = [],
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

  // Slide-out menu below lg, the same one the studio picker uses below md.
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
    <aside
      className={`hero-rail shrink-0 flex flex-row lg:flex-col items-center lg:items-stretch gap-1 px-2 py-2 lg:px-2.5 lg:py-3 ${collapsed ? 'lg:w-15' : 'lg:w-56'}`}
      aria-label="Studio navigation"
    >
      <div className={`hero-rail-brand flex items-center gap-2 px-1.5 ${collapsed ? 'is-collapsed' : ''}`}>
        <span className="hero-rail-brand-mark flex items-center gap-2 min-w-0">
          <img src="/favicon.svg" alt="" aria-hidden="true" width={24} height={24} className="h-6 w-6 shrink-0" />
          {/* Same two wordmarks as the studio picker (one shows per theme). Fades out smoothly when the desktop rail collapses to icons. */}
          <span className="hero-rail-wordmark">
            <img src="/appblips-wordmark-dark.svg" alt="AppBlips" width={1203} height={276} className="hero-rail-wordmark-img studio-logo-dark" />
            <img src="/appblips-wordmark-light.svg" alt="" aria-hidden="true" width={1203} height={276} className="hero-rail-wordmark-img studio-logo-light" />
          </span>
        </span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="hero-rail-toggle hidden lg:inline-flex"
          aria-label={collapsed ? 'Expand side panel' : 'Collapse side panel'}
          aria-expanded={!collapsed}
          data-tip={collapsed ? 'Expand side panel' : 'Collapse side panel'}
          data-tip-side="right"
        >
          {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
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
        <RailItem icon={Plus} label="New" tip="Start something new" collapsed={collapsed} onClick={onNewApp} primary />
        <RailItem
          icon={FolderOpen}
          label="Saved apps"
          tip="My saved projects"
          tipKey={SHORTCUT_HINTS.apps}
          tour="apps"
          collapsed={collapsed}
          onClick={onOpenApps}
          badge={savedAppsCount > 0 ? (
            <span className="hero-rail-count hidden lg:inline-flex">{savedAppsCount}</span>
          ) : null}
        />
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
        {recentProjects.length > 0 && (
          <div
            className={`hero-rail-recents hidden lg:grid${collapsed ? ' is-collapsed' : ''}`}
            inert={collapsed}
            aria-hidden={collapsed}
          >
            <div className="hero-rail-recents-inner flex flex-col gap-0.5 min-h-0">
              <p className="hero-rail-heading">Recents</p>
              {recentProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onLoadProject?.(project)}
                  className="hero-rail-recent"
                  title={project.name}
                >
                  <span className="truncate">{project.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <span className="hidden lg:block lg:flex-1" aria-hidden="true" />

        {workspaceActive && (
          <RailItem icon={Compass} label="Tour" tip="Take the workspace tour" tour="tour" collapsed={collapsed} onClick={onStartTour} />
        )}
        <RailItem icon={Plug} label="Extensions" collapsed={collapsed} onClick={onOpenExtensions} />
        <RailItem icon={Settings} label="Settings" tour="settings" collapsed={collapsed} onClick={onOpenSettings} />
        <RailItem icon={MessageSquare} label="Feedback" collapsed={collapsed} onClick={() => setFeedbackOpen(true)} />
        <RailItem icon={CircleHelp} label="Help" tip="Open the AppBlips docs" tipKey={SHORTCUT_HINTS.help} tour="help" collapsed={collapsed} href={DOCS_URL} />
        <RailItem icon={ThemeIcon} label={resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'} tip={themeTip} collapsed={collapsed} onClick={onToggleTheme} />
        {workspaceActive && (
          <>
            <RailItem icon={DoorOpen} label="Exit" tip="Exit to the studio picker (app, website or game)" collapsed={collapsed} onClick={onExit} />
            {isDesktop && (
              <RailItem icon={Power} label="Quit" tip="Quit AppBlips" collapsed={collapsed} onClick={() => desktopBridge.app.quit()} />
            )}
          </>
        )}
        <FreeAccountControl account={freeAccount} variant="rail" collapsed={collapsed} />
      </nav>
    </aside>

    {/* Mobile slide-out menu (below lg). Always mounted so it can animate;
        `inert` keeps the closed panel out of tab order. Reuses the studio
        picker's panel styles (studio-choice.css). */}
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
          <p className="studio-menu-heading">Workspace</p>
          <button type="button" className="studio-menu-item" onClick={fromMenu(onNewApp)}>
            <Plus size={18} aria-hidden="true" /> New Project
          </button>
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
          {workspaceActive && (
            <button type="button" className="studio-menu-item" onClick={fromMenu(onStartTour)}>
              <Compass size={18} aria-hidden="true" /> Take the tour
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
          <a href="https://www.appblips.com/privacy" target="_blank" rel="noopener noreferrer" className="studio-menu-item" onClick={fromMenu()}>
            <ShieldCheck size={18} aria-hidden="true" /> Privacy Policy
          </a>
          <a href="https://www.appblips.com/terms" target="_blank" rel="noopener noreferrer" className="studio-menu-item" onClick={fromMenu()}>
            <ScrollText size={18} aria-hidden="true" /> Terms of Service
          </a>
          {workspaceActive && (
            <>
              <div className="studio-menu-sep" role="separator" />
              <button type="button" className="studio-menu-item" aria-label="Exit to the studio picker" onClick={fromMenu(onExit)}>
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
