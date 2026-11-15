import { ArrowLeft, ArrowUpRight, FolderUp, Megaphone, Sparkles, Users } from 'lucide-react';
import { DISCORD_URL, DOCS_URL, GITHUB_URL } from '../lib/constants';

// Keep announcements here so new entries can be added without changing the layout.
const UPDATES = [
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
    id: 'import',
    category: 'Workflow',
    Icon: FolderUp,
    title: 'Your next project can start with what you already have.',
    description: 'Import an HTML page, a website ZIP or a React + Vite project, then keep editing with AI. Export your work or publish it when you’re ready to share.',
    href: DOCS_URL,
    label: 'Read the docs',
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
        {UPDATES.map(({ id, category, Icon, title, description, highlights, href, label }, index) => (
          <article key={id} className="whats-new-card" aria-labelledby={`update-${id}`}>
            <div className="whats-new-meta studio-text-soft">
              <span className="whats-new-category"><Icon size={15} aria-hidden="true" />{category}</span>
              {index === 0 && <span className="whats-new-featured"><Megaphone size={13} aria-hidden="true" /> In the spotlight</span>}
            </div>
            <h2 id={`update-${id}`} className="studio-text-strong">{title}</h2>
            <p className="studio-text-muted">{description}</p>
            {highlights && <ul className="whats-new-highlights studio-text-muted">{highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>}
            <a href={href} target="_blank" rel="noopener noreferrer" className="studio-nav-link studio-focus whats-new-link">
              {label}<ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </article>
        ))}
      </div>
      <p className="whats-new-end studio-text-soft">Built with your ideas. Keep them coming.</p>
    </main>
  );
}
