import { ArrowLeft, ArrowUpRight, FolderUp, Gauge, KeyRound, LayoutTemplate, LogIn, Megaphone, MousePointerClick, PanelLeft, Sparkles, Users } from 'lucide-react';
import '../styles/app/whats-new.css';
import { DISCORD_URL, DOCS_URL, GITHUB_URL, WEB_APP_URL } from '../lib/constants';

// Keep announcements here so new entries can be added without changing the layout.
// A card has one link (href + label) or several (links: [{ href, label }]).
const UPDATES = [
  {
    id: 'click-to-edit',
    category: 'Visual editor',
    Icon: MousePointerClick,
    title: 'Upgraded click-to-edit visual canvas.',
    description: 'Select elements directly in the live preview to resize images, move text and images, and fine-tune formatting with the expanded element and text toolbars—no extra AI prompt needed.',
    highlights: ['Resize & move images or text', 'Container-aware image resizing', 'Expanded formatting toolbars'],
  },
  {
    id: 'unified-workspace',
    category: 'Workspace',
    Icon: PanelLeft,
    title: 'A unified hero & build workspace.',
    description: 'The start screen and build canvas now flow together in one continuous workspace, with a collapsible sidebar for quick access to new projects, recents and settings.',
    highlights: ['Seamless transition into building', 'Collapsible sidebar rail', 'Cleaner mobile slide-out menu'],
  },
  {
    id: 'token-usage',
    category: 'Transparency',
    Icon: Gauge,
    title: 'Live token counter & usage breakdown.',
    description: 'Keep an eye on estimated chat tokens right in the Build pane header—on desktop and phones alike. Click the counter to open a full usage breakdown, with real counts preserved even if you stop a request mid-stream.',
    highlights: ['Header counter on desktop & mobile', 'Detailed usage breakdown panel', 'Real counts kept on stopped runs'],
  },
  {
    id: 'browser-direct-keys',
    category: 'Privacy & BYOK',
    Icon: KeyRound,
    title: 'Own API keys go straight to the provider.',
    description: 'When using your own API key in the browser version, chat requests now travel directly from your browser to the AI provider instead of passing through the AppBlips server.',
    highlights: ['Direct browser-to-provider requests', 'No AppBlips proxy for your own keys'],
    href: `${DOCS_URL}ai-providers`,
    label: 'Explore AI providers',
  },
  {
    id: 'create',
    category: 'Product highlights',
    Icon: Sparkles,
    title: 'One idea. Three ways to build.',
    description: 'Start with a mobile & web app, a responsive website or a browser game. Pick your studio, describe your idea and bring it to life with a live preview.',
    highlights: ['A studio for every idea', 'Live previews as you build', 'Your code, yours to keep'],
    href: `${GITHUB_URL}/releases`,
    label: 'Explore release notes',
  },
  {
    id: 'sign-in',
    category: 'Accounts',
    Icon: LogIn,
    title: 'Sign in for Free AI.',
    description: 'Free AI in the browser version now asks you to sign in with Google or GitHub, so usage limits are counted per person instead of shared by everyone. Your account menu sits in the header, and you can delete your account at any time in Settings → Danger Zone.',
    highlights: ['One click with Google or GitHub', 'AppBlips never sees your password', 'No sign-in needed with your own API key'],
    links: [
      { href: WEB_APP_URL, label: 'Open web.appblips.com' },
      { href: `${DOCS_URL}ai-providers#free-ai`, label: 'How Free AI works' },
    ],
  },
  {
    id: 'import',
    category: 'Workflow',
    Icon: FolderUp,
    title: 'Your next project can start with what you already have.',
    description: 'Import an HTML page, a website ZIP or a React + Vite project, then keep editing with AI. Export your work or publish it when you’re ready to share.',
    href: DOCS_URL,
    label: 'Read the docs',
  },
  {
    id: 'templates',
    category: 'Coming soon',
    Icon: LayoutTemplate,
    title: 'Templates for every studio.',
    description: 'Soon you’ll be able to start a mobile & web app, a responsive website or a browser game from a ready-made template. Pick one, make it your own and ship even sooner.',
  },
  {
    id: 'community',
    category: 'Community',
    Icon: Users,
    title: 'Made something? Let’s see it.',
    description: 'Explore community-built websites and games in AppBlips. Join us on Discord to share your creations, swap ideas and help shape what comes next.',
    href: DISCORD_URL,
    label: 'Join the conversation',
  },
];

export default function WhatsNew({ onBack }) {
  return (
    <main id="whats-new" className="whats-new mx-auto w-full max-w-4xl flex-1 px-4 sm:px-6 md:px-10" aria-labelledby="whats-new-title">
      <button type="button" onClick={onBack} className="studio-nav-link studio-focus whats-new-back">
        <ArrowLeft size={16} aria-hidden="true" /> Back to studios
      </button>
      <header className="whats-new-header">
        <span className="studio-eyebrow"><span className="studio-eyebrow-dot" aria-hidden="true" /> The AppBlips bulletin</span>
        <h1 id="whats-new-title" className="studio-text-strong">What’s <span>new.</span></h1>
        <p className="studio-text-muted">Fresh updates, announcements and ideas for your next build.</p>
      </header>
      <div className="whats-new-feed">
        {UPDATES.map(({ id, category, Icon, title, description, highlights, href, label, links = href ? [{ href, label }] : [] }, index) => (
          <article key={id} className="whats-new-card" aria-labelledby={`update-${id}`}>
            <div className="whats-new-meta studio-text-soft">
              <span className="whats-new-category"><Icon size={15} aria-hidden="true" />{category}</span>
              {index === 0 && <span className="whats-new-featured"><Megaphone size={13} aria-hidden="true" /> In the spotlight</span>}
            </div>
            <h2 id={`update-${id}`} className="studio-text-strong">{title}</h2>
            <p className="studio-text-muted">{description}</p>
            {highlights && <ul className="whats-new-highlights studio-text-muted">{highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>}
            {links.length > 0 && (
              <div className="whats-new-links">
                {links.map((link) => (
                  <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="studio-nav-link studio-focus whats-new-link">
                    {link.label}<ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
      <p className="whats-new-end studio-text-soft">Built with your ideas. Keep them coming.</p>
    </main>
  );
}
