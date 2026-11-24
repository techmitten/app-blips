import '../styles/app/hero-landing.css';
import '../styles/app/studio-choice.css';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronRight, FolderUp, Github, LayoutGrid, LibraryBig, Megaphone, X } from 'lucide-react';
import { GITHUB_URL, DISCORD_URL } from '../lib/constants';
import useHeroRail from '../hooks/useHeroRail';
import DiscordIcon from './DiscordIcon';
import HeroSidebar from './HeroSidebar';
import WhatsNew from './WhatsNew';

// Studio choice screen. Two lives:
//   1. Forced gate -- a fresh session with nothing to resume must pick a
//      studio before any workspace exists (no way back, nothing to go back to).
//   2. Mid-session pick -- opened by "New" after the discard confirmation;
//      `onCancel` is set then, so bailing returns to the untouched workspace.
// It is the app's start page, in the manner of a document tool's "New"
// screen: what you can make on the left, each shown as a wireframe of what
// comes out, and your existing work on the right. Nothing moves or makes a
// sound until it is clicked. It follows the app theme (see studio-choice.css).

// Wireframes of what each studio produces. One drawing language for all
// three: layered surfaces, soft gradients, hairline outlines and brand-coral
// marks for the primary interactive elements.
const SKETCH = { viewBox: '0 0 240 150', fill: 'none', 'aria-hidden': true, className: 'studio-sketch' };

// A dashboard on a desktop window with the same app on a phone in front.
function AppSketch() {
  return (
    <svg {...SKETCH}>
      <defs>
        <linearGradient id="sp-app-chart" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--sc-red)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--sc-red)" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="sp-app-panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--sp-sketch-elevated)" />
          <stop offset="100%" stopColor="var(--sp-surface)" />
        </linearGradient>
      </defs>
      {/* Desktop window */}
      <g className="sk-layer-back">
        <rect className="sk-line sk-surface" x="18" y="20" width="160" height="106" rx="7" />
        <path className="sk-chrome" d="M18 27a7 7 0 0 1 7-7h146a7 7 0 0 1 7 7v8H18v-8z" />
        <path className="sk-line" d="M18 35h160M58 35v91" />
        <circle className="sk-dot" cx="27" cy="27.5" r="2" />
        <circle className="sk-dot" cx="34" cy="27.5" r="2" />
        <circle className="sk-dot" cx="41" cy="27.5" r="2" />
        {/* Sidebar items */}
        <rect className="sk-block-strong" x="25" y="44" width="26" height="5" rx="2" />
        <rect className="sk-accent-soft" x="23" y="43" width="3" height="7" rx="1.5" />
        <rect className="sk-block" x="25" y="55" width="20" height="4" rx="2" />
        <rect className="sk-block" x="25" y="64" width="24" height="4" rx="2" />
        <rect className="sk-block" x="25" y="73" width="18" height="4" rx="2" />
        {/* Dashboard header & KPI cards */}
        <rect className="sk-block-strong" x="68" y="44" width="44" height="6" rx="2" />
        <rect className="sk-block" x="68" y="54" width="28" height="4" rx="2" />
        <rect className="sk-line sk-card" x="68" y="65" width="70" height="50" rx="4" />
        {/* Chart bars */}
        <rect className="sk-block" x="76" y="95" width="9" height="13" rx="2" />
        <rect className="sk-block" x="89" y="86" width="9" height="22" rx="2" />
        <rect className="sk-block" x="102" y="90" width="9" height="18" rx="2" />
        <rect x="115" y="74" width="9" height="34" rx="2" fill="url(#sp-app-chart)" />
      </g>
      {/* Mobile companion in front */}
      <g className="sk-layer-front">
        <rect className="sk-shadow" x="148" y="38" width="70" height="102" rx="11" />
        <rect className="sk-line" x="148" y="36" width="70" height="102" rx="11" fill="url(#sp-app-panel)" />
        <rect className="sk-block" x="174" y="41" width="18" height="2.5" rx="1.25" />
        <rect className="sk-block-strong" x="158" y="50" width="30" height="5" rx="2" />
        <rect className="sk-line sk-card" x="158" y="61" width="50" height="26" rx="4" />
        <path className="sk-spark" d="M163 80l9-7 8 4 10-9 12 6" />
        <circle className="sk-accent" cx="190" cy="68" r="2.2" />
        <rect className="sk-block" x="158" y="94" width="50" height="4" rx="2" />
        <rect className="sk-block" x="158" y="102" width="36" height="4" rx="2" />
        <rect className="sk-accent" x="158" y="114" width="50" height="14" rx="4" />
        <rect className="sk-cta-label" x="171" y="119.5" width="24" height="3" rx="1.5" />
      </g>
    </svg>
  );
}

// Two browser windows, one behind the other: a site with more than one page.
function WebsiteSketch() {
  return (
    <svg {...SKETCH}>
      <defs>
        <linearGradient id="sp-web-media" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--sc-red)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--sp-sketch-fill)" />
        </linearGradient>
      </defs>
      {/* Back browser window */}
      <g className="sk-layer-back">
        <rect className="sk-line sk-surface" x="52" y="16" width="166" height="104" rx="7" />
        <path className="sk-line" d="M52 30h166" />
        <rect className="sk-block" x="64" y="38" width="42" height="5" rx="2" />
        <rect className="sk-block" x="64" y="48" width="90" height="4" rx="2" />
      </g>
      {/* Front browser window */}
      <g className="sk-layer-front">
        <rect className="sk-shadow" x="22" y="34" width="168" height="104" rx="7" />
        <rect className="sk-line sk-surface" x="22" y="32" width="168" height="104" rx="7" />
        <path className="sk-chrome" d="M22 39a7 7 0 0 1 7-7h154a7 7 0 0 1 7 7v7H22v-7z" />
        <path className="sk-line" d="M22 46h168" />
        <circle className="sk-dot" cx="31" cy="39" r="2" />
        <circle className="sk-dot" cx="38" cy="39" r="2" />
        <circle className="sk-dot" cx="45" cy="39" r="2" />
        <rect className="sk-block" x="66" y="36.5" width="80" height="5" rx="2.5" />
        {/* Nav bar */}
        <rect className="sk-block-strong" x="32" y="54" width="18" height="4.5" rx="2" />
        <rect className="sk-block" x="124" y="54.5" width="14" height="3.5" rx="1.5" />
        <rect className="sk-block" x="143" y="54.5" width="14" height="3.5" rx="1.5" />
        <rect className="sk-block" x="162" y="54.5" width="16" height="3.5" rx="1.5" />
        {/* Hero copy + CTA */}
        <rect className="sk-block-strong" x="32" y="68" width="64" height="7" rx="2.5" />
        <rect className="sk-block" x="32" y="79" width="48" height="5" rx="2" />
        <rect className="sk-accent" x="32" y="92" width="38" height="12" rx="4" />
        <rect className="sk-cta-label" x="40" y="96.5" width="22" height="3" rx="1.5" />
        {/* Hero image card */}
        <rect className="sk-line" x="110" y="66" width="68" height="40" rx="4" fill="url(#sp-web-media)" />
        <circle className="sk-accent-soft" cx="126" cy="78" r="4.5" />
        <path className="sk-line" d="M110 98l17-15 13 11 10-7 28 19" />
        {/* Feature cards */}
        <rect className="sk-line sk-card" x="32" y="114" width="44" height="13" rx="3" />
        <rect className="sk-line sk-card" x="84" y="114" width="44" height="13" rx="3" />
        <rect className="sk-line sk-card" x="136" y="114" width="44" height="13" rx="3" />
      </g>
    </svg>
  );
}

// A level on a screen: platforms, a score, and the player mid-jump.
function GameSketch() {
  return (
    <svg {...SKETCH}>
      <defs>
        <radialGradient id="sp-game-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--sc-red)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--sc-red)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Arcade frame */}
      <rect className="sk-line sk-surface" x="24" y="18" width="192" height="114" rx="8" />
      {/* HUD bar */}
      <rect className="sk-block-strong" x="34" y="27" width="32" height="6" rx="3" />
      <circle className="sk-accent" cx="178" cy="30" r="3" />
      <circle className="sk-accent" cx="188" cy="30" r="3" />
      <circle className="sk-block" cx="198" cy="30" r="3" />
      {/* Ground & platforms */}
      <path className="sk-block" d="M24 112h192v12a8 8 0 0 1-8 8H32a8 8 0 0 1-8-8z" />
      <path className="sk-line" d="M24 112h192" />
      <rect className="sk-line sk-card" x="94" y="84" width="46" height="8" rx="3" />
      <rect className="sk-line sk-card" x="154" y="62" width="42" height="8" rx="3" />
      {/* Start pad & trajectory */}
      <path className="sk-line" d="M42 112v-8h14v8" />
      <path className="sk-line sk-dash" d="M60 100c10-30 30-34 50-30" />
      {/* Player & collectible */}
      <g className="sk-layer-front">
        <circle cx="117" cy="76" r="18" fill="url(#sp-game-glow)" />
        <rect className="sk-accent" x="110" y="69" width="14" height="14" rx="3.5" />
        <circle className="sk-cta-label" cx="115" cy="74.5" r="1.2" />
        <circle className="sk-cta-label" cx="120" cy="74.5" r="1.2" />
        <circle className="sk-accent-soft" cx="175" cy="50" r="6" />
        <circle className="sk-line" cx="175" cy="50" r="6" />
      </g>
    </svg>
  );
}

const STUDIOS = [
  {
    key: 'app',
    Sketch: AppSketch,
    title: 'Mobile & Web App',
    description: 'Tools, dashboards and utilities that work on phones and desktops.',
    cta: 'Build an app',
  },
  {
    key: 'website',
    Sketch: WebsiteSketch,
    title: 'Responsive Website',
    description: 'Sites with several pages that fit every screen, ready to publish.',
    cta: 'Build a website',
  },
  {
    key: 'game',
    Sketch: GameSketch,
    title: 'Game',
    description: '2D and 3D games for the browser, with touch and keyboard controls.',
    cta: 'Build a game',
  },
];

// Colours come from the studio-* classes (studio-choice.css), not Tailwind's
// white/black utilities, so each one has a dark and a light value.
const FOCUS_RING = 'studio-focus';
const NAV_LINK = `studio-nav-link rounded-md px-1 text-sm font-medium ${FOCUS_RING}`;
const GHOST_BTN = `studio-ghost-btn inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium ${FOCUS_RING}`;

export default function StudioChoice({ onSelectStudio, onCancel = null, onOpenProjects, onOpenSettings, onOpenExtensions, onImportSite = null, onOpenShowcase = null, recents = [], currentProjectId = null, onLoadProject = null, resolvedTheme, onToggleTheme = null, freeAccount = null }) {
  // The same side rail as the studio shell, with the same pinned state.
  const rail = useHeroRail();
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const scrollRef = useRef(null);
  const newsLinkRef = useRef(null);
  const navigateToNews = setShowWhatsNew;
  useEffect(() => {
    if (!showWhatsNew) return;
    const scroll = scrollRef.current;
    const newsLink = newsLinkRef.current;
    scroll?.scrollTo(0, 0);
    scroll?.querySelector('.whats-new-back')?.focus({ preventScroll: true });
    return () => {
      scroll?.scrollTo(0, 0);
      newsLink?.focus({ preventScroll: true });
    };
  }, [showWhatsNew]);
  // Number keys 1-3 start a studio from anywhere on the picker, unless a
  // field or a modal has the keyboard.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || showWhatsNew) return;
      if (event.target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return;
      const studio = STUDIOS[Number(event.key) - 1];
      if (!studio) return;
      event.preventDefault();
      onSelectStudio(studio.key);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onSelectStudio, showWhatsNew]);

  // Arrow keys (and Home/End) move between the studio tiles.
  const tileRefs = useRef([]);
  const onTilesKeyDown = (event) => {
    const index = tileRefs.current.indexOf(document.activeElement);
    if (index < 0) return;
    const next = {
      ArrowRight: (index + 1) % STUDIOS.length,
      ArrowDown: (index + 1) % STUDIOS.length,
      ArrowLeft: (index - 1 + STUDIOS.length) % STUDIOS.length,
      ArrowUp: (index - 1 + STUDIOS.length) % STUDIOS.length,
      Home: 0,
      End: STUDIOS.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    tileRefs.current[next]?.focus();
  };

  // Escape mirrors the on-screen close control, but only when there is
  // something to go back to (the forced gate has none); in What's New it goes
  // back to the studios first. A modal open over the picker (e.g. Settings)
  // handles its own Escape first.
  useEffect(() => {
    if (!onCancel && !showWhatsNew) return;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (showWhatsNew) setShowWhatsNew(false);
      else onCancel?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, showWhatsNew]);

  // Opening saved work, bringing a site in or looking around, instead of
  // starting fresh.
  // Recent projects themselves are listed in the side rail.
  const ACTIONS = [
    {
      key: 'projects',
      Icon: LibraryBig,
      title: 'My projects',
      description: recents.length > 0 ? 'Search, rename or delete saved projects.' : 'Open a project you saved earlier.',
      onClick: onOpenProjects,
    },
    {
      key: 'import',
      Icon: FolderUp,
      title: 'Import a site',
      description: 'Keep editing an HTML page, a website .zip or a React + Vite project.',
      onClick: onImportSite,
      hidden: !onImportSite,
    },
    {
      key: 'showcase',
      Icon: LayoutGrid,
      title: 'Explore',
      description: 'See what others built with AppBlips.',
      onClick: onOpenShowcase,
      hidden: !onOpenShowcase,
    },
  ];
  const actionRow = ({ Icon, title, description, onClick }) => (
    <button type="button" onClick={onClick} aria-label={title} title={description} className={`studio-action-card ${FOCUS_RING}`}>
      <span className="studio-action-icon" aria-hidden="true">
        <Icon size={16} />
      </span>
      <span className="studio-action-text">
        <span className="studio-action-title studio-text-strong">{title}</span>
        <span className="studio-action-desc studio-text-soft">{description}</span>
      </span>
      <ChevronRight size={15} className="studio-action-chevron" aria-hidden="true" />
    </button>
  );

  // "New" in the rail is this page; it brings the studios back into view.
  const focusStudios = () => {
    navigateToNews(false);
    requestAnimationFrame(() => tileRefs.current[0]?.focus());
  };

  // Laid out like the studio shell (HeroLanding): the side rail, then the
  // page in the same inset stage the composer and workspace use.
  return (
    <div className={`hero-landing${resolvedTheme === 'light' ? '' : ' dark force-dark'} flex flex-1 min-h-0 min-w-0 flex-col lg:flex-row`}>
      <HeroSidebar
        {...rail}
        newActive
        onNewApp={focusStudios}
        onOpenApps={onOpenProjects}
        savedAppsCount={recents.length}
        recents={recents}
        currentProjectId={currentProjectId}
        onLoadProject={onLoadProject}
        onOpenSettings={onOpenSettings}
        onOpenExtensions={onOpenExtensions}
        onToggleTheme={onToggleTheme}
        resolvedTheme={resolvedTheme}
        freeAccount={freeAccount}
      />
      <div className="flex flex-1 min-h-0 min-w-0 px-1.5 pb-1.5 lg:pl-0 lg:pt-1.5">
        <div className="hero-stage studio-stage studio-choice studio-picker relative flex flex-1 min-h-0 min-w-0 flex-col">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Go back"
              title="Go back (Esc)"
              className={`${GHOST_BTN} studio-close h-9 w-9`}
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
          <div ref={scrollRef} className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <div className="flex min-h-full flex-col">
              {showWhatsNew ? <WhatsNew onBack={() => navigateToNews(false)} /> : <div className="relative flex flex-1 flex-col">

            <main className="studio-main studio-wrap">
              <header className="studio-head">
                <p className="studio-eyebrow">
                  <span className="studio-eyebrow-dot" aria-hidden="true" />
                  <span>AppBlips Studio</span>
                </p>
                <h1 className="studio-title studio-text-strong">Start a new project</h1>
                <p className="studio-lead studio-text-muted">Choose what you’re making. You’ll describe it on the next screen.</p>
              </header>

              <section className="studio-new" aria-label="New project">
                  <div className="studio-tiles" role="group" aria-label="Choose what to build" onKeyDown={onTilesKeyDown}>
                    {STUDIOS.map(({ key, Sketch, title, description, cta }, index) => (
                      <button
                        key={key}
                        ref={(node) => { tileRefs.current[index] = node; }}
                        type="button"
                        aria-keyshortcuts={String(index + 1)}
                        onClick={() => onSelectStudio(key)}
                        aria-label={`${cta}: ${title}`}
                        data-studio={key}
                        className={`studio-tile ${FOCUS_RING}`}
                      >
                        <span className="studio-tile-art"><Sketch /></span>
                        <span className="studio-tile-body">
                          <span className="studio-tile-copy">
                            <span className="studio-tile-title studio-text-strong">{title}</span>
                            <span className="studio-tile-desc studio-text-soft">{description}</span>
                          </span>
                          <span className="studio-tile-foot">
                            <span className="studio-tile-cta">
                              <span>{cta}</span>
                              <ArrowRight size={14} className="studio-tile-arrow" aria-hidden="true" />
                            </span>
                            <kbd className="studio-key" aria-hidden="true" title={`Press ${index + 1}`}>{index + 1}</kbd>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {/* Other ways to begin: saved work, an existing site, the showcase. */}
                  <ul className="studio-actions">
                    {ACTIONS.filter((action) => !action.hidden).map((action) => <li key={action.key}>{actionRow(action)}</li>)}
                  </ul>
                </section>
            </main>
          </div>}

          <footer className="studio-footer relative shrink-0">
            <div className="studio-footer-inner studio-wrap flex flex-col items-center gap-1 xl:flex-row xl:justify-center xl:gap-6">
              <button
                ref={newsLinkRef}
                type="button"
                onClick={() => navigateToNews(true)}
                aria-current={showWhatsNew ? 'page' : undefined}
                className={`${NAV_LINK} inline-flex min-h-9 items-center gap-2 whitespace-nowrap`}
              >
                <Megaphone size={17} aria-hidden="true" /> What’s New
              </button>
              <nav aria-label="Footer links" className="flex-wrap max-md:hidden flex items-center justify-center gap-x-4 gap-y-1 whitespace-nowrap sm:gap-x-6">
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="AppBlips on GitHub"
                  title="AppBlips on GitHub"
                  className={`${NAV_LINK} inline-flex min-h-9 items-center gap-2`}
                >
                  <Github size={17} aria-hidden="true" />
                  <span>GitHub</span>
                </a>
                <a
                  href={DISCORD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Join the AppBlips Discord"
                  title="Join the AppBlips Discord"
                  className={`${NAV_LINK} inline-flex min-h-9 items-center gap-2`}
                >
                  <DiscordIcon size={17} />
                  <span>Discord</span>
                </a>
                <a
                  href="https://www.appblips.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${NAV_LINK} inline-flex min-h-9 items-center`}
                >
                  Privacy Policy
                </a>
                <a
                  href="https://www.appblips.com/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${NAV_LINK} inline-flex min-h-9 items-center`}
                >
                  Terms of Service
                </a>
              </nav>
              <p className="studio-text-soft text-xs">© 2026 TechMitten LLC. All rights reserved.</p>
            </div>
          </footer>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
