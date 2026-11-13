import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, CircleAlert, CloudUpload, Copy, ExternalLink, Globe, ImagePlus, LifeBuoy, Loader2, Lock, RefreshCw, Search, Smartphone, Sparkles, Trash2 } from 'lucide-react';
import Modal, { ModalCloseButton } from './Modal';
import { FIELD_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, Switch } from './SettingControls';
import {
  MAX_HOST_LENGTH, SURGE_A_RECORD, SURGE_CNAME_TARGET, SURGE_SUFFIX, dnsRecordFor, isCustomHost, normalizeSiteHost, siteHost, siteUrl, loadFavicon, loadProtected, loadPublishedName, loadPwa, loadSearchable, saveFavicon, saveProtected, savePublishedName, savePwa, saveSearchable, suggestSurgeName,
  surgeCheckDns, surgeLogin, surgePublish, surgeSignOut, surgeStatus, surgeUnpublish,
} from '../lib/surge';
import { addNoIndex } from '../lib/seo';
import { buildPwaManifest, buildServiceWorker, defaultPwaIconBase64, injectPwaPrompt } from '../lib/pwa';
import { MIN_GATE_PASSWORD_LENGTH, checkGatePassword } from '../lib/passwordGate';
import { shareLinks } from '../lib/share';
import { bytesToBase64, collectSiteImages, pointAtCopies } from '../lib/siteImages';
import { FAVICON_PATH, faviconBase64, makeFavicon, withFavicon } from '../lib/favicon';
import ShareIcon from './ShareIcons';
import ShowcaseSubmitModal from './ShowcaseSubmitModal';
import DnsHelpModal from './DnsHelpModal';

const LABEL_CLASS = 'block text-sm font-semibold text-slate-900';
const LINK_CLASS = 'font-semibold text-indigo-600 hover:underline';

// Shown on the manage and done steps once the project has an address.
function ShowcaseSubmitLink({ onClick, disabled = false }) {
  return (
    <p className="flex items-center gap-1.5 text-xs leading-snug text-slate-600">
      <Sparkles size={13} className="shrink-0 text-indigo-600" aria-hidden="true" />
      Proud of it?{' '}
      <button type="button" onClick={onClick} disabled={disabled} className={LINK_CLASS}>Submit it to the showcase</button>
    </p>
  );
}

// Copies a value and says so for a moment. `compact` is the icon-only form
// used beside DNS values.
function CopyButton({ value, label, compact = false }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked: the value is still on screen */ }
  };
  if (compact) {
    return (
      <button type="button" onClick={copy} aria-label={copied ? 'Copied' : `Copy ${label}`} title={copied ? 'Copied' : 'Copy'} className="shrink-0 rounded-md p-1 text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-800">
        {copied ? <Check size={13} className="text-emerald-600" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      </button>
    );
  }
  return (
    <button type="button" onClick={copy} aria-label={copied ? 'Copied' : `Copy ${label}`} className={`${SECONDARY_BUTTON} shrink-0 py-1 text-xs`}>
      {copied ? <Check size={13} className="text-emerald-600" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

const ICON_TYPES = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico';

// A custom domain's DNS state at a glance: red and pulsing until the DNS
// check succeeds, then solid green. `size` is the dot's Tailwind size class.
function StatusDot({ ok, size = 'h-2 w-2', className = '' }) {
  return (
    <span className={`relative inline-flex shrink-0 ${size} ${className}`} aria-hidden="true">
      {!ok && <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 motion-safe:animate-ping" />}
      <span className={`relative inline-flex ${size} rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
    </span>
  );
}

// The site as a visitor's browser shows it: a tab with the site icon and
// name, over the address bar. On the publish step the address is typed right
// in the bar (`children`, `editable`); elsewhere it shows the live address.
// Like a browser's toolbar, the address sits in an inset box: bordered like
// any other field while editable, so it reads as one in both themes. The
// icon is only shown here; SiteIconRow picks it.
function SitePreview({ title, icon, live = false, pending = false, editable = false, children }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <div className="flex items-end gap-2 px-2 pt-2">
        <div className="flex min-w-0 max-w-[70%] items-center gap-2 rounded-t-lg border border-b-0 border-slate-200 bg-surface px-3 py-1.5">
          {icon
            ? <img src={icon} alt="" className="h-4 w-4 shrink-0 rounded-sm object-contain" />
            : <Globe size={14} className="shrink-0 text-slate-400" aria-hidden="true" />}
          <span className="truncate text-xs font-medium text-slate-700">{title}</span>
        </div>
        {live && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 pb-1.5 pr-1 text-xs font-semibold text-emerald-600">
            <StatusDot ok size="h-2 w-2" />Live
          </span>
        )}
        {!live && pending && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 pb-1.5 pr-1 text-xs font-semibold text-slate-600">
            <StatusDot ok={false} size="h-2 w-2" />Waiting for DNS
          </span>
        )}
      </div>
      <div className="border-t border-slate-200 p-2">
        <div
          className={`flex items-center gap-2 rounded-lg bg-surface px-3 py-2 ${editable
            ? 'border border-slate-300 transition-colors hover:border-slate-400 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/30'
            : 'border border-transparent'}`}
        >
          <Lock size={14} className="shrink-0 text-slate-400" aria-label="HTTPS" />
          {children}
        </div>
      </div>
    </div>
  );
}

// The site icon (favicon), as the first row of the publish options. Picking
// an image only changes what the next Publish / Update site sends.
function SiteIconRow({ icon, onIcon, disabled }) {
  const input = useRef(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setReading(true);
    setError('');
    try {
      onIcon(await makeFavicon(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        {icon
          ? <img src={icon} alt="" className="mt-0.5 h-4 w-4 shrink-0 rounded-sm object-contain" />
          : <ImagePlus size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p id="opt-icon-title" className="text-sm font-semibold text-slate-900">Site icon</p>
          {error
            ? <p role="alert" className="mt-0.5 text-xs leading-snug text-red-600">{error}</p>
            : (
              <p className="mt-0.5 text-xs leading-snug text-slate-600">
                Shown in browser tabs and bookmarks. Square works best.
              </p>
            )}
        </div>
        {/* Centred on the title and description, not lined up with the title. */}
        <div className="flex shrink-0 items-center gap-1 self-center">
          {icon && (
            <button
              type="button"
              onClick={() => { setError(''); onIcon(''); }}
              disabled={disabled || reading}
              aria-label="Remove site icon"
              title="Remove icon"
              className="rounded-md p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          )}
          <input ref={input} type="file" accept={ICON_TYPES} onChange={pick} className="hidden" aria-labelledby="opt-icon-title" />
          <button type="button" onClick={() => input.current?.click()} disabled={disabled || reading} className={`${SECONDARY_BUTTON} py-1 text-xs`}>
            {reading && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
            {icon ? 'Change…' : 'Add icon…'}
          </button>
        </div>
      </div>
    </div>
  );
}

// One publish option: icon, title and what the current setting does, with a
// switch. `details` sits under the row while it's on (the password fields).
function OptionRow({ id, icon: Icon, title, description, checked, onChange, disabled, details }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <Icon size={16} className={`mt-0.5 shrink-0 ${checked ? 'text-indigo-600' : 'text-slate-400'}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p id={`${id}-title`} className="text-sm font-semibold text-slate-900">{title}</p>
          <p id={`${id}-desc`} className="mt-0.5 text-xs leading-snug text-slate-600">{description}</p>
        </div>
        <Switch checked={checked} onChange={onChange} labelledBy={`${id}-title`} describedBy={`${id}-desc`} disabled={disabled} />
      </div>
      {details && <div className="mt-3 pl-7">{details}</div>}
    </div>
  );
}

// Site icon, search engines, install prompt and password, the same on the publish and
// manage steps. The password is never saved here: Update site asks for it
// again. The pages are encrypted before upload (lib/passwordGate.js), so the
// password isn't in the published files and neither is the project's code.
function PublishOptions({ icon, onIcon, searchable, onSearchable, pwa, onPwa, locked, onLocked, password, onPassword, confirm, onConfirm, wasProtected, disabled }) {
  return (
    <div className="divide-y divide-slate-200/80">
      <SiteIconRow icon={icon} onIcon={onIcon} disabled={disabled} />
      <OptionRow
        id="opt-search"
        icon={Search}
        title="Let search engines find this site"
        description={locked
          ? 'Password-protected sites always stay out of search results.'
          : searchable
            ? 'Your site can show up in Google and other search results.'
            : 'Search engines are asked to leave it out. The link still works.'}
        checked={searchable && !locked}
        onChange={onSearchable}
        disabled={disabled || locked}
      />
      <OptionRow
        id="opt-pwa"
        icon={Smartphone}
        title="Prompt visitors to install as an app"
        description={pwa
          ? 'Visitors are invited to add it to their phone or computer, with its own icon.'
          : 'Visitors see a regular web page.'}
        checked={pwa}
        onChange={onPwa}
        disabled={disabled}
      />
      <OptionRow
        id="opt-lock"
        icon={Lock}
        title="Password protect this site"
        description={locked
          ? 'Visitors type a password before they see anything. Your code stays encrypted until then.'
          : 'Anyone with the link can see your site.'}
        checked={locked}
        onChange={onLocked}
        disabled={disabled}
        details={locked && (
          <div className="space-y-2.5">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="site-password" className="block text-xs font-semibold text-slate-700">Site password</label>
                <input
                  id="site-password"
                  type="password"
                  value={password}
                  onChange={(event) => onPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={disabled}
                  aria-describedby="site-password-help"
                  className={FIELD_CLASS}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="site-password-confirm" className="block text-xs font-semibold text-slate-700">Type it again</label>
                <input
                  id="site-password-confirm"
                  type="password"
                  value={confirm}
                  onChange={(event) => onConfirm(event.target.value)}
                  autoComplete="new-password"
                  disabled={disabled}
                  className={FIELD_CLASS}
                />
              </div>
            </div>
            <p id="site-password-help" className="text-xs leading-snug text-slate-600">
              At least {MIN_GATE_PASSWORD_LENGTH} characters. A few random words work well. AppBlips doesn&rsquo;t save it, so keep it somewhere safe.
              {wasProtected && ' Type it again to update the site, or a new one to change it.'}
            </p>
          </div>
        )}
      />
    </div>
  );
}

// The one DNS record a custom domain needs before it works (siteAddress.js).
// Surge publishes right away; visitors reach it once the record is in place.
// `onHelp` opens the provider guides (DnsHelpModal).
function DnsSetup({ host, onHelp }) {
  const record = dnsRecordFor(host);
  const fields = [['Type', record.type], ['Name', record.name], ['Value', record.value]];
  return (
    <div className="space-y-2.5 text-xs leading-snug text-slate-600">
      <p>
        Where you bought <strong className="font-semibold text-slate-800">{host}</strong>, open its DNS settings and add this record:
      </p>
      <dl className="grid grid-cols-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-slate-200 bg-surface">
        {fields.map(([term]) => (
          <dt key={term} className="border-b border-slate-200 px-3 py-1.5 font-medium text-slate-600">{term}</dt>
        ))}
        {fields.map(([term, value]) => (
          <dd key={term} className="flex min-w-0 items-center gap-1 px-3 py-1.5 font-mono text-[13px] text-slate-900">
            <span className="min-w-0 break-all">{value}</span>
            {term === 'Value' && <CopyButton value={value} label={`DNS ${term.toLowerCase()}`} compact />}
          </dd>
        ))}
      </dl>
      <p>
        {record.root
          ? <>If your provider offers ALIAS or ANAME records, you can point <span className="font-mono">@</span> at <span className="font-mono">{SURGE_CNAME_TARGET}</span> instead.</>
          : <>For a domain with no prefix, like example.com, add an A record for <span className="font-mono">@</span> with <span className="font-mono">{SURGE_A_RECORD}</span> instead.</>}
        {' '}It can take up to a day to start working. Surge adds HTTPS by itself, and the www and plain versions of the domain open the same site.
      </p>
      <p>
        <button type="button" onClick={onHelp} className={`inline-flex items-start gap-1 text-left ${LINK_CLASS}`}>
          <LifeBuoy size={13} className="mt-px shrink-0" aria-hidden="true" />Not sure how? Guides for GoDaddy, Namecheap and other providers
        </button>
      </p>
    </div>
  );
}

const DNS_RECHECK_MS = 30_000;

// Watches whether a custom domain's DNS points at Surge yet (surgeCheckDns):
// checks when `host` is set, then every 30 seconds until it's connected.
// `checkNow` checks again straight away. `checking` is true during a check.
function useDnsCheck(host) {
  const [state, setState] = useState({ status: 'checking', cname: [], ips: [] });
  // `tick` asks for a check; `answered` is the tick the latest reply was for,
  // so a check is running while they differ.
  const [tick, setTick] = useState(0);
  const [answered, setAnswered] = useState(-1);
  const checking = Boolean(host) && answered !== tick;
  const connected = state.status === 'connected';

  useEffect(() => {
    if (!host) return undefined;
    let live = true;
    surgeCheckDns(host).then((result) => {
      if (!live) return;
      setState(result.error ? { status: 'unknown', cname: [], ips: [] } : result);
      setAnswered(tick);
    });
    return () => { live = false; };
  }, [host, tick]);

  useEffect(() => {
    if (!host || connected) return undefined;
    const timer = setTimeout(() => setTick((n) => n + 1), DNS_RECHECK_MS);
    return () => clearTimeout(timer);
  }, [host, connected, tick]);

  return { ...state, checking, checkNow: () => setTick((n) => n + 1) };
}

// One line saying where the domain's DNS stands, under the record to add.
function DnsStatusLine({ host, check }) {
  const { status, cname, ips, checking, checkNow } = check;
  if (status === 'connected') {
    return (
      <p role="status" className="flex items-start gap-2 text-xs leading-snug text-emerald-700 dark:text-emerald-400">
        <StatusDot ok className="mt-1" />
        <span><strong className="font-semibold">{host} is connected.</strong> HTTPS can take a few more minutes to switch on.</span>
      </p>
    );
  }
  const pointsTo = cname[0] || ips.join(', ');
  const message = {
    checking: `Checking ${host}…`,
    missing: `No record for ${host} yet. AppBlips checks again every 30 seconds.`,
    elsewhere: `${host} points to ${pointsTo}, not Surge. Change that record to the one above. AppBlips checks again every 30 seconds.`,
    unknown: 'Couldn’t check DNS right now. AppBlips tries again every 30 seconds.',
  }[status];
  return (
    <div className="flex items-start justify-between gap-3">
      <p role="status" className="flex min-w-0 items-start gap-2 text-xs leading-snug text-slate-600">
        <StatusDot ok={false} className="mt-1" />
        <span className="min-w-0 break-words">{message}</span>
      </p>
      {status !== 'checking' && (
        <button type="button" onClick={checkNow} disabled={checking} className={`shrink-0 text-xs ${LINK_CLASS} disabled:opacity-50`}>
          {checking ? 'Checking…' : 'Check now'}
        </button>
      )}
    </div>
  );
}

// Publish: puts the current pages on Surge (surge.sh) at a free
// <name>.surge.sh address with HTTPS, or at a domain the user owns ("Use a
// domain I own"), which then needs one DNS record (DnsSetup). The first time it asks for a Surge sign-in
// (a new email creates the account); the server keeps the token
// (lib/surge.js). `buildFiles` returns the same pages Export downloads.
// Images made with Pollinations are copied into the site (lib/siteImages.js)
// so they stay online as long as it does.
// A project that is already online opens on 'manage' instead: update the
// site, unpublish it, or publish to a different address.
// `connectOnly` (Settings → Extensions) is the same window with nothing to
// publish: it signs in or out of Surge and stops at 'account'.
// Once a project is online, "Submit to the showcase" opens the showcase form
// with its address filled in; `studioMode` pre-picks app/website/game.
export default function PublishDialog({ projectId, projectName, buildFiles, galleryFiles, extraFiles, onClose, connectOnly = false, studioMode = '' }) {
  // loading | signin | account | manage | unpublish | removed | ready | publishing | done
  const [step, setStep] = useState('loading');
  // The address this project is live at (without .surge.sh), or ''.
  const [published, setPublished] = useState(() => loadPublishedName(projectId));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // New users pick "Create an account", which asks for the password twice so
  // a typo doesn't lock them out of the account it creates.
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [account, setAccount] = useState('');
  const [name, setName] = useState(() => suggestSurgeName(projectName));
  // "Use a domain I own": publish to customDomain instead of <name>.surge.sh.
  const [ownDomain, setOwnDomain] = useState(false);
  const [customDomain, setCustomDomain] = useState('');
  const [favicon, setFavicon] = useState(() => loadFavicon(projectId));
  const [searchable, setSearchable] = useState(() => loadSearchable(projectId));
  const [pwaPrompt, setPwaPrompt] = useState(() => loadPwa(projectId));
  // Never stored: only whether the site is protected is remembered.
  const [locked, setLocked] = useState(() => loadProtected(projectId));
  const wasLocked = useRef(locked).current;
  const [sitePassword, setSitePassword] = useState('');
  const [siteConfirm, setSiteConfirm] = useState('');
  // The address the showcase form is open for, or ''.
  const [submitUrl, setSubmitUrl] = useState('');
  // Whether the DNS provider guides (DnsHelpModal) are open over this window.
  const [dnsHelp, setDnsHelp] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const mounted = useRef(true);
  const signedInStep = connectOnly ? 'account' : published ? 'manage' : 'ready';

  useEffect(() => {
    mounted.current = true;
    surgeStatus().then((status) => {
      if (!mounted.current) return;
      if (status.signedIn) {
        setAccount(status.email);
        setStep(signedInStep);
      } else {
        setStep('signin');
      }
    });
    return () => { mounted.current = false; };
    // Only on open: later steps are chosen by the actions below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      // The showcase form and DNS help above this dialog close themselves on Escape.
      if (event.key !== 'Escape' || busy || submitUrl || dnsHelp) return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose, busy, submitUrl, dnsHelp]);

  const signIn = async (event) => {
    event.preventDefault();
    if (creating && password !== confirm) {
      setError('The passwords don’t match. Type the same password in both boxes.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await surgeLogin(email.trim(), password);
    if (!mounted.current) return;
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPassword('');
    setConfirm('');
    setAccount(result.email);
    setStep(signedInStep);
  };

  const signOut = async () => {
    await surgeSignOut();
    if (!mounted.current) return;
    setAccount('');
    setError('');
    setStep('signin');
  };

  // From 'ready' (a new address) or 'manage' (Update site, same address); a
  // failure goes back to where it started.
  const publishTo = async (target, from) => {
    const clean = target.trim().toLowerCase();
    if (locked) {
      const problem = checkGatePassword(sitePassword) || (sitePassword !== siteConfirm ? 'The site passwords don’t match. Type the same password in both boxes.' : '');
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    setError('');
    if (from === 'ready') setStep('publishing');
    const pages = buildFiles();
    if (!searchable || locked) {
      for (const name of Object.keys(pages)) if (name.endsWith('.html')) pages[name] = addNoIndex(pages[name]);
    }
    if (pwaPrompt) {
      for (const name of Object.keys(pages)) if (name.endsWith('.html')) pages[name] = injectPwaPrompt(pages[name], { projectName });
    }
    const { images } = await collectSiteImages(pages);
    // The user's own images (My images) are already at images/<name> in the pages.
    const ownImages = galleryFiles ? galleryFiles(pages) : [];
    const uploads = Object.fromEntries([...images, ...ownImages].map(({ path, bytes }) => [path, bytesToBase64(bytes)]));
    let icon = faviconBase64(favicon);
    if (!icon && pwaPrompt) {
      icon = defaultPwaIconBase64(projectName);
    }
    if (icon) uploads[FAVICON_PATH] = icon;
    const sitePages = pointAtCopies(pages, images);
    // sitemap.xml and robots.txt from the SEO connector (lib/seo.js).
    const extras = Object.fromEntries((extraFiles && !locked ? extraFiles(pages, searchable) : []).map(({ path, text }) => [path, text]));
    if (pwaPrompt) {
      extras['manifest.webmanifest'] = buildPwaManifest(projectName);
      extras['sw.js'] = buildServiceWorker();
    }
    const result = await surgePublish(
      clean,
      icon ? withFavicon(sitePages) : sitePages,
      Object.keys(uploads).length ? uploads : undefined,
      Object.keys(extras).length ? extras : undefined,
      locked ? sitePassword : undefined,
    );
    if (!mounted.current) return;
    setBusy(false);
    if (result.error) {
      setError(result.error);
      setStep(result.signedOut ? 'signin' : from);
      return;
    }
    // A surge.sh address is kept as just its name, a custom domain in full.
    const site = normalizeSiteHost(clean);
    const stored = site?.custom ? site.host : (site?.host.slice(0, -SURGE_SUFFIX.length) || clean);
    savePublishedName(projectId, stored);
    // Stored even when left at its default: once the site has an address, an
    // unstored choice reads as off (see loadSearchable).
    saveSearchable(projectId, searchable);
    saveProtected(projectId, locked);
    savePwa(projectId, pwaPrompt);
    setSitePassword('');
    setSiteConfirm('');
    setPublished(stored);
    setUrl(result.url);
    setStep('done');
  };

  const changeFavicon = (icon) => {
    setFavicon(icon);
    saveFavicon(projectId, icon);
  };

  const changeSearchable = (allowed) => {
    setSearchable(allowed);
    saveSearchable(projectId, allowed);
  };

  const changePwaPrompt = (enabled) => {
    setPwaPrompt(enabled);
    savePwa(projectId, enabled);
  };

  const publish = (event) => {
    event.preventDefault();
    publishTo(ownDomain ? customDomain : name, 'ready');
  };

  const unpublish = async () => {
    setBusy(true);
    setError('');
    const result = await surgeUnpublish(published);
    if (!mounted.current) return;
    setBusy(false);
    if (result.error) {
      setError(result.error);
      setStep(result.signedOut ? 'signin' : 'manage');
      return;
    }
    savePublishedName(projectId, '');
    saveProtected(projectId, false);
    setStep('removed');
  };

  const publishedUrl = siteUrl(published);
  const publishedHost = siteHost(published);
  const publishedCustom = isCustomHost(published);
  // A custom domain is only live once its DNS points at Surge, so the done
  // and manage steps watch it (useDnsCheck) instead of assuming.
  const dnsCheck = useDnsCheck(publishedCustom && (step === 'done' || step === 'manage') ? publishedHost : '');
  const reachable = !publishedCustom || dnsCheck.status === 'connected';
  const dnsPending = publishedCustom && dnsCheck.status !== 'connected';

  const optionProps = {
    icon: favicon,
    onIcon: changeFavicon,
    searchable,
    onSearchable: changeSearchable,
    pwa: pwaPrompt,
    onPwa: changePwaPrompt,
    locked,
    onLocked: setLocked,
    password: sitePassword,
    onPassword: setSitePassword,
    confirm: siteConfirm,
    onConfirm: setSiteConfirm,
    wasProtected: wasLocked,
    disabled: busy,
  };

  const accountLine = (
    <span className="min-w-0">
      Surge account <strong className="font-semibold text-slate-700 break-all">{account}</strong>{' '}
      <button type="button" onClick={signOut} disabled={busy} className={LINK_CLASS}>Sign out</button>
    </span>
  );

  const errorLine = error && (
    <p role="alert" className="flex items-start gap-2 text-xs leading-snug text-red-600">
      <CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />{error}
    </p>
  );

  return (
    <Modal
      zIndex={70}
      cardClass="w-full max-w-md xl:max-w-lg bg-surface rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-scale-in flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]"
      cardProps={{ role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'publish-title' }}
    >
      <div className="shrink-0 px-6 py-5 border-b border-slate-100 flex items-center justify-between">
        <h2 id="publish-title" className="flex items-center gap-2 text-base 2xl:text-lg font-semibold text-slate-900">
          <Globe size={18} aria-hidden="true" />
          {connectOnly ? 'Surge' : 'Publish to the web'}
        </h2>
        <ModalCloseButton onClick={onClose} disabled={busy} />
      </div>

      {step === 'loading' && (
        <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading…
        </div>
      )}

      {step === 'signin' && (
        <form onSubmit={signIn} className="flex min-h-0 flex-col">
          <div className="p-6 space-y-4 overflow-y-auto text-sm text-slate-700">
            <p className="text-xs leading-snug text-slate-600">
              AppBlips publishes with <a href="https://surge.sh" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>Surge</a>,
              free hosting that gives your site its own web address with HTTPS.
              {creating
                ? ' Type your email and choose a password for your free Surge account.'
                : ' Sign in with your Surge account.'}
            </p>
            <div className="flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Surge account">
              {[[false, 'I have an account'], [true, 'Create an account']].map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => { setCreating(value); setConfirm(''); setError(''); }}
                  aria-pressed={creating === value}
                  disabled={busy}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    creating === value ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="surge-email" className={LABEL_CLASS}>Email</label>
              <input
                id="surge-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                autoFocus
                required
                className={FIELD_CLASS}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="surge-password" className={LABEL_CLASS}>Password</label>
              <input
                id="surge-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={creating ? 'new-password' : 'current-password'}
                required
                className={FIELD_CLASS}
              />
            </div>
            {creating && (
              <div className="space-y-1.5">
                <label htmlFor="surge-confirm" className={LABEL_CLASS}>Type the password again</label>
                <input
                  id="surge-confirm"
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  required
                  className={FIELD_CLASS}
                />
              </div>
            )}
            {errorLine}
            <p className="text-xs leading-snug text-slate-600">
              Your password goes to Surge once and isn&rsquo;t saved. AppBlips keeps only the sign-in Surge sends back, on this computer.
              By signing in you agree to <a href="https://surge.sh/terms" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>Surge&rsquo;s terms</a>.
            </p>
          </div>
          <div className="shrink-0 bg-slate-50 px-6 py-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BUTTON}>Cancel</button>
            <button type="submit" disabled={busy || !email.trim() || !password || (creating && !confirm)} className={PRIMARY_BUTTON}>
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {creating ? 'Create account' : 'Sign in'}
            </button>
          </div>
        </form>
      )}

      {step === 'account' && (
        <>
          <div className="p-6 space-y-3 text-sm text-slate-700">
            <p role="status" className="flex items-center gap-2 font-semibold text-emerald-600">
              <Check size={18} aria-hidden="true" />Connected to Surge
            </p>
            <p className="text-xs leading-snug text-slate-600">
              Signed in as <strong className="text-slate-700">{account}</strong>. To put a project online, open it and
              click <strong className="text-slate-800">Publish</strong> above the preview.
            </p>
          </div>
          <div className="shrink-0 bg-slate-50 px-6 py-4 flex justify-end gap-3">
            <button type="button" onClick={signOut} className={SECONDARY_BUTTON}>Sign out</button>
            <button type="button" onClick={onClose} autoFocus className={PRIMARY_BUTTON}>Done</button>
          </div>
        </>
      )}

      {step === 'manage' && (
        <>
          <div className="min-h-0 overflow-y-auto p-6 space-y-5 text-sm text-slate-700">
            <div className="space-y-2">
              <SitePreview title={projectName} icon={favicon} live={reachable} pending={dnsPending}>
                <a href={publishedUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm font-semibold text-indigo-600 hover:underline">
                  {publishedHost}
                </a>
                <a href={publishedUrl} target="_blank" rel="noopener noreferrer" aria-label="Open site in a new tab" className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              </SitePreview>
              {publishedCustom && <DnsStatusLine host={publishedHost} check={dnsCheck} />}
              {publishedCustom && (
                <details className="group rounded-lg">
                  <summary className="cursor-pointer list-none text-xs font-semibold text-indigo-600 hover:underline [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-1">
                      <ChevronRight size={13} className="transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                      DNS setup for {publishedHost}
                    </span>
                  </summary>
                  <div className="pt-2.5"><DnsSetup host={publishedHost} onHelp={() => setDnsHelp(true)} /></div>
                </details>
              )}
            </div>
            <PublishOptions {...optionProps} />
            {errorLine}
            {reachable && <ShowcaseSubmitLink onClick={() => setSubmitUrl(publishedUrl)} disabled={busy} />}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-slate-200/80 pt-4 text-xs text-slate-600">
              <button type="button" onClick={() => { setError(''); setStep('ready'); }} disabled={busy} className={LINK_CLASS}>
                Publish to a different address
              </button>
              {accountLine}
            </div>
          </div>
          <div className="shrink-0 bg-slate-50 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => { setError(''); setStep('unpublish'); }}
              disabled={busy}
              className={`${SECONDARY_BUTTON} text-red-600 hover:text-red-700`}
            >
              <Trash2 size={14} aria-hidden="true" />Unpublish
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BUTTON}>Cancel</button>
              <button type="button" onClick={() => publishTo(published, 'manage')} disabled={busy} autoFocus className={PRIMARY_BUTTON}>
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
                {busy ? 'Updating…' : 'Update site'}
              </button>
            </div>
          </div>
        </>
      )}

      {step === 'unpublish' && (
        <>
          <div className="p-6 space-y-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Unpublish {publishedHost}?</p>
            <p className="text-xs leading-snug text-slate-600">
              The site goes offline right away and the link stops working. Your project stays in AppBlips, so you can publish it again later.
              {publishedCustom
                ? ' Your domain stays yours; you can also remove its DNS record for Surge.'
                : ' Someone else could take this address in the meantime.'}
            </p>
            {errorLine}
          </div>
          <div className="shrink-0 bg-slate-50 px-6 py-4 flex justify-end gap-3">
            <button type="button" onClick={() => setStep('manage')} disabled={busy} autoFocus className={SECONDARY_BUTTON}>Keep it online</button>
            <button
              type="button"
              onClick={unpublish}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2 bg-red-600 text-white font-semibold text-sm hover:bg-red-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
              {busy ? 'Unpublishing…' : 'Unpublish'}
            </button>
          </div>
        </>
      )}

      {step === 'removed' && (
        <>
          <div className="p-6 space-y-2 text-sm text-slate-700">
            <p role="status" className="flex items-center gap-2 font-semibold text-slate-900">
              <Check size={18} aria-hidden="true" />{publishedHost} is offline
            </p>
            <p className="text-xs leading-snug text-slate-600">It can take a minute for the old version to disappear everywhere.</p>
          </div>
          <div className="shrink-0 bg-slate-50 px-6 py-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                if (publishedCustom) {
                  setOwnDomain(true);
                  setCustomDomain(published);
                } else {
                  setName(published);
                }
                setPublished('');
                setStep('ready');
              }}
              className={SECONDARY_BUTTON}
            >
              Publish again
            </button>
            <button type="button" onClick={onClose} autoFocus className={PRIMARY_BUTTON}>Done</button>
          </div>
        </>
      )}

      {(step === 'ready' || step === 'publishing') && (
        <form onSubmit={publish} className="flex min-h-0 flex-col">
          <div className="p-6 space-y-5 overflow-y-auto text-sm text-slate-700">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="surge-name" className={LABEL_CLASS}>{ownDomain ? 'Your domain' : 'Web address'}</label>
                <button
                  type="button"
                  onClick={() => { setOwnDomain(!ownDomain); setError(''); }}
                  aria-pressed={ownDomain}
                  disabled={busy}
                  className={`text-xs ${LINK_CLASS}`}
                >
                  {ownDomain ? 'Use a free .surge.sh address' : 'Use a domain I own'}
                </button>
              </div>
              <SitePreview title={projectName} icon={favicon} editable>
                {/* Clicking anywhere in the bar types into the address. */}
                <span onClick={() => document.getElementById('surge-name')?.focus()} className="flex min-w-0 flex-1 cursor-text items-baseline text-sm">
                  <span className="hidden shrink-0 text-slate-500 sm:inline" aria-hidden="true">https://</span>
                  {ownDomain ? (
                    <input
                      key="custom"
                      id="surge-name"
                      type="text"
                      inputMode="url"
                      value={customDomain}
                      onChange={(event) => setCustomDomain(event.target.value.toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]/g, ''))}
                      maxLength={MAX_HOST_LENGTH}
                      placeholder="www.example.com"
                      autoFocus
                      spellCheck={false}
                      autoCapitalize="none"
                      disabled={busy}
                      aria-describedby="surge-name-help"
                      className="min-w-0 flex-1 bg-transparent font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-500"
                    />
                  ) : (
                    <>
                      <input
                        key="surge"
                        id="surge-name"
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        maxLength={63}
                        size={1}
                        autoFocus
                        spellCheck={false}
                        disabled={busy}
                        aria-describedby="surge-name-help"
                        className="min-w-0 flex-1 bg-transparent font-semibold text-slate-900 outline-none"
                      />
                      {/* Pinned to the far edge behind a divider, away from
                          the caret, so it doesn't read as editable text. */}
                      <span className="ml-3 shrink-0 select-none border-l border-slate-200 pl-3 text-slate-500">{SURGE_SUFFIX}</span>
                    </>
                  )}
                </span>
              </SitePreview>
              <p id="surge-name-help" className="text-xs leading-snug text-slate-600">
                {ownDomain
                  ? 'A domain you’ve bought, like example.com or www.example.com. After publishing, AppBlips shows the one DNS record to add where you bought it.'
                  : 'Letters, numbers and dashes. If someone else already uses the name, pick another.'}
                {published && ` This makes a second copy. ${publishedHost} stays online until you unpublish it.`}
              </p>
            </div>
            <PublishOptions {...optionProps} />
            {errorLine}
            <p className="border-t border-slate-200/80 pt-4 text-xs text-slate-600">{accountLine}</p>
          </div>
          <div className="shrink-0 bg-slate-50 px-6 py-4 flex justify-end">
            <div className="flex gap-3">
              <button type="button" onClick={published ? () => { setError(''); setStep('manage'); } : onClose} disabled={busy} className={SECONDARY_BUTTON}>
                {published ? 'Back' : 'Cancel'}
              </button>
              <button type="submit" disabled={busy || !(ownDomain ? customDomain : name)} className={PRIMARY_BUTTON}>
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Globe size={16} aria-hidden="true" />}
                {busy ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          </div>
        </form>
      )}

      {step === 'done' && (
        <>
          <div className="min-h-0 overflow-y-auto p-6 space-y-5 text-sm text-slate-700">
            <div className="space-y-2">
              {reachable ? (
                <p role="status" className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white animate-scale-in motion-reduce:animate-none">
                    <Check size={14} strokeWidth={3} aria-hidden="true" />
                  </span>
                  Your site is live
                </p>
              ) : (
                <p role="status" className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white">
                    <CloudUpload size={14} strokeWidth={2.5} aria-hidden="true" />
                  </span>
                  Uploaded to Surge
                </p>
              )}
              <SitePreview title={projectName} icon={favicon} live={reachable} pending={dnsPending}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm font-semibold text-indigo-600 hover:underline">
                  {url.replace(/^https:\/\//, '')}
                </a>
                <CopyButton value={url} label="link" />
              </SitePreview>
            </div>
            {publishedCustom && !reachable && (
              <section aria-labelledby="dns-step" className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 id="dns-step" className="text-sm font-semibold text-slate-900">Connect {publishedHost} to go live</h3>
                <DnsSetup host={publishedHost} onHelp={() => setDnsHelp(true)} />
                <div className="border-t border-slate-200 pt-3">
                  <DnsStatusLine host={publishedHost} check={dnsCheck} />
                </div>
              </section>
            )}
            {publishedCustom && reachable && <DnsStatusLine host={publishedHost} check={dnsCheck} />}
            {reachable && <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Share it</p>
              <div className="flex flex-wrap gap-2">
                {shareLinks(url, projectName).map(({ id, label, href }) => (
                  <a
                    key={id}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={id === 'email' ? 'Share by email' : `Share on ${label}`}
                    title={id === 'email' ? 'Email' : label}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <ShareIcon id={id} />
                  </a>
                ))}
              </div>
            </div>}
            {!publishedCustom && (
              <p className="text-xs leading-snug text-slate-600">
                It can take a minute to appear everywhere. After you make changes, click Publish again to update it.
              </p>
            )}
            {reachable && <ShowcaseSubmitLink onClick={() => setSubmitUrl(url)} />}
          </div>
          <div className="shrink-0 bg-slate-50 px-6 py-4 flex justify-end gap-3">
            {/* Until the domain is connected the link can't open the site yet,
                so Close leads and Open site stays available for checking. */}
            {reachable ? (
              <>
                <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>Close</button>
                <a href={url} target="_blank" rel="noopener noreferrer" className={PRIMARY_BUTTON}>
                  <ExternalLink size={16} aria-hidden="true" />Open site
                </a>
              </>
            ) : (
              <>
                <a href={url} target="_blank" rel="noopener noreferrer" className={SECONDARY_BUTTON}>
                  <ExternalLink size={14} aria-hidden="true" />Open site
                </a>
                <button type="button" onClick={onClose} className={PRIMARY_BUTTON}>Close</button>
              </>
            )}
          </div>
        </>
      )}
      {/* Portaled out of the card: its scale-in transform would otherwise
          contain the dialog's fixed-position scrim. */}
      {dnsHelp && createPortal(
        <DnsHelpModal host={publishedHost} record={dnsRecordFor(publishedHost)} onClose={() => setDnsHelp(false)} />,
        document.body,
      )}
      {submitUrl && createPortal(
        <ShowcaseSubmitModal
          initialUrl={submitUrl}
          initialProjectName={projectName}
          initialKind={studioMode}
          onClose={() => setSubmitUrl('')}
        />,
        document.body,
      )}
    </Modal>
  );
}
