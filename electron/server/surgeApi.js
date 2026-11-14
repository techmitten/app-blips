// /api/surge/*: publishes a project to Surge (surge.sh), free static hosting
// with HTTPS on every <name>.surge.sh address, or on a domain the user owns
// once its DNS points at Surge (src/lib/siteAddress.js). Used by all three hosts
// (electron/main.js, server.js, the Vite dev server), so Fetch primitives
// only, like chatProxy.js. The calls to Surge happen here rather than in the
// page because Surge's API doesn't allow cross-origin requests, and so the
// Surge token stays server-side like the AI key: the page sees only the
// account email.
//
//   GET    /api/surge          -> { email, signedIn }
//   POST   /api/surge/login    -> { email, password } signs in (a new email
//                                 creates a free account); only the token is kept
//   DELETE /api/surge          -> sign out
//   POST   /api/surge/publish  -> { domain ('my-site' or 'www.shop.com'),
//                                   files: { 'index.html': html },
//                                   images?: { 'images/<name>.jpg': base64,
//                                              'favicon.png': base64 },
//                                   password?: string  (lock the site, see
//                                              src/lib/passwordGate.js),
//                                   extras?: { 'sitemap.xml': text,
//                                              'robots.txt': text } }
//                                 -> { url, domain, custom?, dns?, preview? }
//                                    or { error, signedOut?, retryAt? }
//                                    (dns: the record a custom domain needs,
//                                    see dnsRecordFor; preview: the upload's
//                                    own surge.sh address, which works before
//                                    the domain's DNS does; retryAt: when a
//                                    rate-limited publish may be retried)
//                                 (images: Pollinations images copied into the
//                                 site, see src/lib/siteImages.js, and the site
//                                 icon, see src/lib/favicon.js; extras: the SEO
//                                 connector's files, see src/lib/seo.js)
//   POST   /api/surge/unpublish -> { domain } takes that site offline
//                                 -> { removed: true } or { error, signedOut? }
//   POST   /api/surge/domain   -> { domain } where a custom domain stands:
//                                 its DNS, Surge's own state, its certificate
//                                 and whether it answers over HTTPS
//                                 (domainStatus). Read-only; safe to poll
//   POST   /api/surge/encrypt  -> { domain } asks Surge for a Let's Encrypt
//                                 certificate for a custom domain (what
//                                 `surge <domain> debug encrypt` does). Surge
//                                 gets one by itself once the DNS is right;
//                                 this is the nudge for when it's stuck
//                                 -> { issued: true } or
//                                    { error, signedOut?, retryAt? }
//   POST   /api/surge/verify   -> {} resends the Surge account's email
//                                 verification link (`surge verify`)
//                                 -> { sent, verified?, message? } or
//                                    { error, signedOut? }
//
// `tokens` is { describe, keyFor, save, clear }: browserKeys.js (kept in the visitor's browser) in the browser
// version, electron/surgeStore.js (OS keychain) on desktop.
import { isForeignOrigin } from './chatProxy.js';
import { createTar, gzip } from './tar.js';
import { MAX_FILES_BYTES, MAX_PAGES, validatePageName } from '../../src/lib/pages.js';
import { MAX_SITE_IMAGES_BYTES, SITE_IMAGE_PATH_RE } from '../../src/lib/siteImages.js';
import { FAVICON_PATH, MAX_FAVICON_BYTES, addFaviconLinks } from '../../src/lib/favicon.js';
import { checkGatePassword, inlineGateImages, protectPages } from '../../src/lib/passwordGate.js';
import { SURGE_CNAME_TARGET, SURGE_EDGE_IPS, SURGE_SUFFIX, dnsRecordFor, normalizeSiteHost } from '../../src/lib/siteAddress.js';

export const SURGE_API = 'https://surge.surge.sh';
export { SURGE_SUFFIX, normalizeSiteHost };
// Surge's API expects a CLI version with every publish.
const SURGE_CLIENT_VERSION = '0.56.0';
const MAX_EMAIL = 254;
const MAX_PASSWORD = 256;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

const basicAuth = (user, pass) => 'Basic ' + btoa(String.fromCharCode(...new TextEncoder().encode(`${user}:${pass}`)));

const BAD_ADDRESS = 'Use only lowercase letters, numbers and dashes for the address, and start and end with a letter or number.';
const BAD_DOMAIN = 'Type a domain you own, like www.example.com.';
// Which complaint fits: a typed domain (has a dot, not surge.sh) or a name.
const addressProblem = (domain) => {
  const typed = String(domain ?? '').trim().toLowerCase();
  return typed.includes('.') && !typed.endsWith(SURGE_SUFFIX) ? BAD_DOMAIN : BAD_ADDRESS;
};

// The text of a `message` / `error` field: a string, or { message }.
const textOf = (value) => (typeof value === 'string' ? value : typeof value?.message === 'string' ? value.message : '');
const strings = (list) => (Array.isArray(list) ? list.filter((m) => typeof m === 'string') : []);

// Surge explains a refusal in its JSON body or, when the body is empty, in a
// `reason` header. Read in the order Surge's docs give (surge-docs/api.md):
// `messages`, then `message` (rate limits use it), then `error`, then the
// header.
async function surgeReason(response) {
  let body = null;
  try {
    body = JSON.parse(await response.text());
  } catch { /* no JSON body */ }
  return strings(body?.messages).join(' ')
    || textOf(body?.message)
    || textOf(body?.error)
    || strings(body?.errors).join(' ')
    || response.headers.get('reason')
    || '';
}

// A deploy-style reply (publish, encrypt): one JSON object per line.
const parseEvents = (text) => text.split('\n').map((line) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}).filter(Boolean);

// What an `error` line says: { error: { message } } (surge-docs/api-deploys.md),
// or the older `message` / `messages` / `errors` fields.
const eventMessage = (event) => [textOf(event.error), textOf(event.message), ...strings(event.messages), ...strings(event.errors)]
  .filter(Boolean).join(' ');

const checkFiles = (files) => {
  if (!files || typeof files !== 'object' || Array.isArray(files)) return 'Nothing to publish.';
  const names = Object.keys(files);
  if (!names.includes('index.html')) return 'Nothing to publish.';
  if (names.length > MAX_PAGES) return 'This project has too many pages to publish.';
  let size = 0;
  for (const name of names) {
    if (!validatePageName(name) || typeof files[name] !== 'string') return 'This project has a page that can’t be published.';
    size += files[name].length;
  }
  // Compiled JSX and loop guards make exports a little bigger than `files`.
  if (size > MAX_FILES_BYTES * 2) return 'This project is too big to publish.';
  return null;
};

async function login({ email, password }, tokens, fetchImpl) {
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  if (!cleanEmail || cleanEmail.length > MAX_EMAIL || !/^[^\s@:]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return json({ error: 'Enter a valid email address.' }, 400);
  }
  if (typeof password !== 'string' || !password || password.length > MAX_PASSWORD) {
    return json({ error: 'Enter a password.' }, 400);
  }
  let response;
  try {
    response = await fetchImpl(`${SURGE_API}/token`, {
      method: 'POST',
      headers: { authorization: basicAuth(cleanEmail, password), accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return json({ error: 'Couldn’t reach Surge. Check your internet connection and try again.' }, 502);
  }
  if (response.status === 401) {
    return json({ error: 'That password doesn’t match this Surge account. If you forgot it, reset it at surge.sh.' }, 400);
  }
  if (!response.ok) {
    const reason = await surgeReason(response);
    return json({ error: reason || `Surge couldn’t sign you in (error ${response.status}).` }, 400);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (typeof body?.token !== 'string' || !body.token) return json({ error: 'Surge sent an unexpected reply. Try again.' }, 502);
  const savedEmail = typeof body.email === 'string' && body.email ? body.email : cleanEmail;
  await tokens.save(savedEmail, body.token);
  return json({ email: savedEmail, signedIn: true });
}

// { path: base64 } -> [{ name, data: Uint8Array }], or an error message.
const decodeImages = (images) => {
  if (images === undefined) return [];
  if (!images || typeof images !== 'object' || Array.isArray(images)) return 'This project has images that can’t be published.';
  const entries = [];
  let size = 0;
  for (const [path, base64] of Object.entries(images)) {
    const favicon = path === FAVICON_PATH;
    if ((!favicon && !SITE_IMAGE_PATH_RE.test(path)) || typeof base64 !== 'string') return 'This project has an image that can’t be published.';
    let binary;
    try {
      binary = atob(base64);
    } catch {
      return 'This project has an image that can’t be published.';
    }
    if (favicon && binary.length > MAX_FAVICON_BYTES) return 'The site icon is too big to publish. Pick a smaller image.';
    size += binary.length;
    if (size > MAX_SITE_IMAGES_BYTES) return 'This project’s images are too big to publish.';
    entries.push({ name: `site/${path}`, path, data: Uint8Array.from(binary, (char) => char.charCodeAt(0)) });
  }
  return entries;
};

// Extra text files: SEO connector (sitemap.xml, robots.txt) and PWA (manifest, service worker).
const EXTRA_FILE_NAMES = ['sitemap.xml', 'robots.txt', 'manifest.webmanifest', 'manifest.json', 'sw.js'];
const MAX_EXTRA_BYTES = 200_000;

// { name: text } -> [{ name, data }], or an error message.
const decodeExtras = (extras) => {
  if (extras === undefined) return [];
  if (!extras || typeof extras !== 'object' || Array.isArray(extras)) return 'This project has a file that can’t be published.';
  const entries = [];
  for (const [name, text] of Object.entries(extras)) {
    if (!EXTRA_FILE_NAMES.includes(name) || typeof text !== 'string' || text.length > MAX_EXTRA_BYTES) return 'This project has a file that can’t be published.';
    entries.push({ name: `site/${name}`, data: text });
  }
  return entries;
};

const IMAGE_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };

async function publish({ domain, files, images, extras, password }, tokens, fetchImpl) {
  const { id: email, hasKey } = tokens.describe();
  const token = hasKey ? tokens.keyFor(email) : '';
  if (!token) return json({ error: 'Sign in to Surge first.', signedOut: true }, 401);
  const site = normalizeSiteHost(domain);
  if (!site) return json({ error: addressProblem(domain) }, 400);
  const { host, custom } = site;
  const problem = checkFiles(files);
  if (problem) return json({ error: problem }, 400);

  const imageEntries = decodeImages(images);
  if (typeof imageEntries === 'string') return json({ error: imageEntries }, 400);

  const extraEntries = decodeExtras(extras);
  if (typeof extraEntries === 'string') return json({ error: extraEntries }, 400);

  let pages = files;
  let uploads = [...imageEntries, ...extraEntries];
  if (password !== undefined) {
    const passwordProblem = checkGatePassword(password);
    if (passwordProblem) return json({ error: passwordProblem }, 400);
    // Pictures go inside the encrypted pages; only the site icon stays public
    // (the lock screen shows it). The sitemap would list the private pages.
    const hidden = imageEntries.filter((entry) => entry.path !== FAVICON_PATH);
    const icon = imageEntries.find((entry) => entry.path === FAVICON_PATH);
    const withImages = inlineGateImages(files, hidden.map(({ path, data }) => ({ path, type: IMAGE_TYPES[path.split('.').pop()], bytes: data })));
    try {
      pages = await protectPages(withImages, password);
    } catch {
      return json({ error: 'Couldn’t lock the site. Try again.' }, 500);
    }
    if (icon) pages = Object.fromEntries(Object.entries(pages).map(([name, html]) => [name, addFaviconLinks(html)]));
    const pwaFiles = extraEntries.filter((entry) => entry.name === 'site/manifest.webmanifest' || entry.name === 'site/manifest.json' || entry.name === 'site/sw.js');
    uploads = icon ? [icon, ...pwaFiles] : [...pwaFiles];
  }

  // Surge drops the first folder of every path, so pages go in as site/<name>.
  const entries = [...Object.entries(pages).map(([name, html]) => ({ name: `site/${name}`, data: html })), ...uploads];
  // A custom domain's project carries a CNAME file naming it, the way Surge's
  // CLI keeps one (surge-docs/platform-custom-domains.md, "Remembering the
  // domain"). Added here, on the way to Surge, so it's in every publish to
  // a custom domain, password-locked or not.
  if (custom) entries.push({ name: 'site/CNAME', data: `${host}\n` });
  const projectSize = entries.reduce((sum, { data }) => sum + (typeof data === 'string' ? new TextEncoder().encode(data).length : data.length), 0);
  const body = await gzip(createTar(entries));

  let response;
  try {
    response = await fetchImpl(`${SURGE_API}/${host}`, {
      method: 'PUT',
      headers: {
        authorization: basicAuth('token', token),
        'content-type': 'application/gzip',
        accept: 'application/x-ndjson',
        version: SURGE_CLIENT_VERSION,
        'file-count': String(entries.length),
        'project-size': String(projectSize),
        timestamp: new Date().toISOString(),
      },
      body,
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return json({ error: 'Couldn’t reach Surge. Check your internet connection and try again.' }, 502);
  }

  if (response.status === 401) {
    // A revoked or expired token: forget it so the page asks to sign in again.
    await tokens.clear();
    return json({ error: 'Your Surge sign-in has expired. Sign in again to publish.', signedOut: true }, 401);
  }
  if (response.status === 403) {
    const reason = await surgeReason(response);
    return json({
      error: reason || (custom
        ? `${host} is already used by another Surge account. If it's yours, remove it there first.`
        : `${host} belongs to another Surge account. Pick a different address.`),
    }, 400);
  }
  if (response.status === 422) {
    const reason = await surgeReason(response);
    return json({ error: reason || 'Surge doesn’t accept that address. Try a different one.' }, 400);
  }
  if (response.status === 429) {
    // Retrying while limited counts against the limit too, so say when.
    const reason = await surgeReason(response);
    return json({
      error: reason || 'Surge is limiting how often this site can be published. Try again later.',
      retryAt: retryAtFrom(response, reason, 15 * 60_000),
    }, 429);
  }
  if (!response.ok) {
    const reason = await surgeReason(response);
    return json({ error: reason || `Surge couldn’t publish the site (error ${response.status}). Try again in a minute.` }, 502);
  }

  // The reply is a stream of JSON lines; an `info` line means the site is
  // live, and a stream without one failed partway.
  let text = '';
  try {
    text = await response.text();
  } catch {
    return json({ error: 'The connection to Surge dropped while publishing. Try again.' }, 502);
  }
  const events = parseEvents(text);
  const info = events.find((event) => event.type === 'info');
  if (info) {
    // The revision's own address on surge.sh, which works before a custom
    // domain's DNS does.
    const preview = typeof info.metadata?.preview === 'string' && info.metadata.preview ? info.metadata.preview : '';
    return json({
      url: `https://${host}`,
      domain: host,
      ...(custom ? { custom: true, dns: dnsRecordFor(host) } : {}),
      ...(preview ? { preview: `https://${preview.replace(/^https?:\/\//, '')}` } : {}),
    });
  }
  if (events.some((event) => event.type === 'collect')) {
    return json({
      error: custom
        ? 'Surge asked for payment to publish to this domain. Check your Surge account, or publish to a free .surge.sh address instead.'
        : 'Surge asked for payment to publish this. Free addresses ending in .surge.sh shouldn’t need it; try a different address.',
    }, 400);
  }
  const failure = events.find((event) => event.type === 'error' || event.messages || event.errors);
  const message = failure ? eventMessage(failure) : '';
  return json({ error: message || 'Surge didn’t finish publishing. Try again.' }, 502);
}

async function unpublish({ domain }, tokens, fetchImpl) {
  const { id: email, hasKey } = tokens.describe();
  const token = hasKey ? tokens.keyFor(email) : '';
  if (!token) return json({ error: 'Sign in to Surge first.', signedOut: true }, 401);
  const site = normalizeSiteHost(domain);
  if (!site) return json({ error: 'That isn’t an address AppBlips can unpublish.' }, 400);
  const { host } = site;
  let response;
  try {
    response = await fetchImpl(`${SURGE_API}/${host}`, {
      method: 'DELETE',
      headers: { authorization: basicAuth('token', token), accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return json({ error: 'Couldn’t reach Surge. Check your internet connection and try again.' }, 502);
  }
  if (response.status === 401) {
    await tokens.clear();
    return json({ error: 'Your Surge sign-in has expired. Sign in again to unpublish.', signedOut: true }, 401);
  }
  // Already gone (removed elsewhere, e.g. with the Surge CLI): nothing to do.
  if (response.ok || response.status === 404) return json({ removed: true });
  const reason = await surgeReason(response);
  if (response.status === 403) {
    return json({ error: reason || `${host} belongs to another Surge account, so it can’t be removed from this one.` }, 400);
  }
  return json({ error: reason || `Surge couldn’t remove the site (error ${response.status}). Try again in a minute.` }, 502);
}

// Public DNS lookups over HTTPS (DNS-over-HTTPS, JSON form), so the check
// works the same in every host, Android included: Cloudflare's resolver,
// then Google's if that one can't be reached. Only the domain name is sent.
export const DOH_RESOLVERS = ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve'];
const DNS_A = 1;
const DNS_NS = 2;
const DNS_CNAME = 5;
const DNS_AAAA = 28;

// { Status, Answer: [{ type, data, TTL }] } from the first resolver that
// answers, or null when none can be reached.
async function resolve(name, type, fetchImpl) {
  for (const base of DOH_RESOLVERS) {
    try {
      const response = await fetchImpl(`${base}?name=${encodeURIComponent(name)}&type=${type}`, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) continue;
      const body = await response.json();
      if (body && typeof body.Status === 'number') return body;
    } catch { /* try the next resolver */ }
  }
  return null;
}

const answers = (reply, type) => (Array.isArray(reply?.Answer) ? reply.Answer : [])
  .filter((record) => record?.type === type && typeof record.data === 'string')
  .map((record) => record.data.trim().toLowerCase().replace(/\.$/, ''));

// The shortest TTL in a reply, in seconds: how long resolvers may keep
// handing out the answer they have now (an old record, after a change).
const ttlOf = (reply) => {
  const ttls = (Array.isArray(reply?.Answer) ? reply.Answer : [])
    .map((record) => record?.TTL)
    .filter((ttl) => Number.isFinite(ttl) && ttl >= 0);
  return ttls.length ? Math.min(...ttls) : null;
};

// Surge's own names: geo.surge.world now, na-west1.surge.sh / geo.surge.sh
// from older instructions, and the ns*.surge.world name servers.
const isSurgeName = (name) => name === SURGE_CNAME_TARGET || name.endsWith('.surge.world') || name.endsWith(SURGE_SUFFIX);

// Cloudflare's published IPv4 ranges (cloudflare.com/ips-v4, checked
// 2026-11-14). An address in them means the record is proxied (the orange
// cloud): visitors reach Cloudflare, so Surge can neither see the domain nor
// get it a certificate.
const CLOUDFLARE_RANGES = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
  '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
  '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
];
const ipToNumber = (ip) => {
  const parts = String(ip).split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return ((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3];
};
export const isCloudflareIp = (ip) => {
  const value = ipToNumber(ip);
  return value !== null && CLOUDFLARE_RANGES.some((range) => {
    const [base, bits] = range.split('/');
    const start = ipToNumber(base);
    return value >= start && value < start + 2 ** (32 - Number(bits));
  });
};

// The name servers of the zone `host` lives in: the nearest name, walking up,
// that has NS records of its own (a name that's a CNAME is skipped, since a
// resolver answers for the CNAME's target instead).
async function zoneNameServers(host, fetchImpl) {
  const labels = host.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    const reply = await resolve(labels.slice(i).join('.'), 'NS', fetchImpl);
    if (answers(reply, DNS_CNAME).length) continue;
    const servers = answers(reply, DNS_NS);
    if (servers.length) return servers;
  }
  return [];
}

// Who runs the domain's DNS, when that changes the instructions.
const dnsProvider = (servers) => {
  // Customers get <name>.ns.cloudflare.com; Cloudflare's own zones ns<n>.cloudflare.com.
  if (servers.some((server) => server.endsWith('.cloudflare.com'))) return 'cloudflare';
  if (servers.some(isSurgeName)) return 'surge';
  return null;
};

// Where `host` points, as the public sees it:
//   connected  a CNAME to one of Surge's names, an A record with one of
//              Surge's addresses, or the domain handed to Surge's name servers
//   mixed      Surge's address plus another (A or AAAA): visitors are split
//              between the two, and Let's Encrypt tries the IPv6 one first,
//              so Surge treats the domain as not pointed. `extra` lists them
//   proxied    Cloudflare's proxy (orange cloud) is in front
//   elsewhere  another host (the old one, a parking page)
//   missing    no record yet
//   unknown    no resolver could be reached
// `ttl` is how long the current answer may stay cached. `servers` are the
// zone's name servers (zoneNameServers), looked up once by the caller.
export async function checkDns(host, fetchImpl, servers = []) {
  const reply = await resolve(host, 'A', fetchImpl);
  if (!reply) return { status: 'unknown', cname: [], ips: [], ttl: null };
  const cname = answers(reply, DNS_CNAME);
  const ips = answers(reply, DNS_A);
  const result = (status, extra) => ({ status, cname, ips, ttl: ttlOf(reply), ...(extra?.length ? { extra } : {}) });
  if (cname.some(isSurgeName)) return result('connected');
  if (ips.some(isCloudflareIp)) return result('proxied');
  if (ips.length) {
    // A flattened CNAME / ALIAS shows up only as addresses: compare them
    // with Surge's servers and with where Surge's name resolves right now.
    let surgeIps = ips.filter((ip) => SURGE_EDGE_IPS.includes(ip));
    if (surgeIps.length < ips.length) {
      const geo = answers(await resolve(SURGE_CNAME_TARGET, 'A', fetchImpl), DNS_A);
      surgeIps = ips.filter((ip) => SURGE_EDGE_IPS.includes(ip) || geo.includes(ip));
    }
    if (surgeIps.length) {
      const others = ips.filter((ip) => !surgeIps.includes(ip));
      if (others.length) return result('mixed', others);
      const ipv6 = answers(await resolve(host, 'AAAA', fetchImpl), DNS_AAAA);
      return ipv6.length ? result('mixed', ipv6) : result('connected');
    }
  }
  if (servers.some(isSurgeName)) return result('connected');
  return result(cname.length || ips.length ? 'elsewhere' : 'missing');
}

// Whether `host` already answers over HTTPS, and who answered. Until Surge
// has a certificate for it the TLS handshake fails (the name isn't on the
// certificate), so fetch throws. Any reply at all, even a 404 or a redirect,
// means a valid certificate, but only Surge's own reply (its `server:
// Surge` / `surge-stamp` headers) means the site is live on Surge: an old
// host or Cloudflare's proxy has certificates of its own.
export async function checkHttps(host, fetchImpl) {
  try {
    const response = await fetchImpl(`https://${host}/`, {
      method: 'HEAD',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    const server = (response.headers.get('server') || '').toLowerCase();
    const via = response.headers.get('cf-ray') || server === 'cloudflare'
      ? 'cloudflare'
      : server === 'surge' || response.headers.has('surge-stamp') ? 'surge' : 'other';
    return { ok: via === 'surge', via };
  } catch {
    return { ok: false, via: null };
  }
}

const tokenOf = (tokens) => {
  const { id: email, hasKey } = tokens.describe();
  return hasKey ? tokens.keyFor(email) : '';
};

// GET on Surge's API with the token: { body }, { signedOut: true } on a 401,
// or null when Surge can't be reached or refuses.
async function surgeGet(path, token, fetchImpl) {
  try {
    const response = await fetchImpl(`${SURGE_API}/${path}`, {
      headers: { authorization: basicAuth('token', token), accept: 'application/json', version: SURGE_CLIENT_VERSION },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401) return { signedOut: true };
    if (!response.ok) return null;
    return { body: await response.json() };
  } catch {
    return null;
  }
}

const SURGE_STATES = ['waiting', 'securing', 'ready', 'live'];

// Surge's own state for a domain (GET /<domain>/status, what `surge status`
// shows): 'waiting' on DNS, 'securing' (getting the certificate), 'ready'
// (published but held until the account's email is verified) or 'live'
// (checked against Surge's servers). `reason` is Surge's explanation, when
// it gives one.
async function surgeState(host, token, fetchImpl) {
  const reply = await surgeGet(`${host}/status`, token, fetchImpl);
  if (!reply?.body) return reply;
  const raw = String(reply.body.status || '').toLowerCase();
  const status = raw.startsWith('waiting') ? 'waiting' : SURGE_STATES.includes(raw) ? raw : '';
  const reason = typeof reply.body.reason === 'string' ? reply.body.reason : '';
  return { status, reason };
}

// Whether a certificate name covers `host`: the same name, or a wildcard
// one level up.
const certCovers = (name, host) => {
  const clean = String(name).toLowerCase().replace(/^dns:/, '').trim();
  if (clean === host) return true;
  return clean.startsWith('*.') && host.endsWith(clean.slice(1)) && host.split('.').length === clean.split('.').length;
};

// The certificate Surge has installed for `host` (GET /<domain>/certs):
// { issued, issuer, expires }. The reply's exact shape isn't documented, so
// this reads the fields the publish stream's `cert` lines use (issuer,
// altnames, expiresInWords) and a few common spellings, and answers null
// when it can't tell.
const certNames = (cert) => [
  ...['altnames', 'altNames', 'names', 'domains', 'subjectaltname'].flatMap((key) => {
    const value = cert?.[key];
    if (Array.isArray(value)) return value;
    return typeof value === 'string' ? value.split(/[,\s]+/) : [];
  }),
  ...[cert?.subject, cert?.subject?.CN, cert?.commonName, cert?.domain].filter((value) => typeof value === 'string'),
];
async function surgeCerts(host, token, fetchImpl) {
  const reply = await surgeGet(`${host}/certs`, token, fetchImpl);
  if (!reply?.body) return null;
  const { body } = reply;
  const list = Array.isArray(body) ? body : Array.isArray(body?.certs) ? body.certs : [];
  const cert = list.find((item) => certNames(item).some((name) => certCovers(name, host)));
  if (!cert) return { issued: false, issuer: '', expires: '' };
  const pick = (...values) => values.find((value) => typeof value === 'string' && value) || '';
  return {
    issued: true,
    issuer: pick(cert.issuer, cert.issuer?.O, cert.issuer?.CN),
    expires: pick(cert.expiresInWords, cert.expires, cert.notAfter, cert.validTo, cert.expiration),
  };
}

// Everything about a custom domain the Publish window shows (useDomainStatus
// in src/components/CustomDomainStatus.jsx), in one call:
//   provider  'cloudflare' | 'surge' | null: who runs its DNS
//   dns       checkDns for the domain; www: the same for www.<domain>, for
//             a root domain only
//   surge     Surge's state (surgeState), null when signed out or unreachable
//   cert      Surge's certificate (surgeCerts), null when unknown
//   https     checkHttps
// No certificate is requested here: Surge gets one by itself once the DNS is
// right, and asking repeatedly runs into Let's Encrypt's limits.
async function domainStatus({ domain }, tokens, fetchImpl) {
  const site = normalizeSiteHost(domain);
  if (!site) return json({ error: addressProblem(domain) }, 400);
  if (!site.custom) return json({ error: 'Only a domain you own needs this check.' }, 400);
  const { host } = site;
  const servers = await zoneNameServers(host, fetchImpl);
  const root = dnsRecordFor(host).root;
  const token = tokenOf(tokens);
  const [dnsResult, www, https, surge, cert] = await Promise.all([
    checkDns(host, fetchImpl, servers),
    root ? checkDns(`www.${host}`, fetchImpl, servers) : null,
    checkHttps(host, fetchImpl),
    token ? surgeState(host, token, fetchImpl) : null,
    token ? surgeCerts(host, token, fetchImpl) : null,
  ]);
  return json({
    host,
    provider: dnsProvider(servers),
    dns: dnsResult,
    ...(www ? { www } : {}),
    surge: surge?.status !== undefined ? surge : null,
    cert,
    https,
    ...(surge?.signedOut || !token ? { signedOut: true } : {}),
    checkedAt: Date.now(),
  });
}

// When a refused request may be tried again, in ms since the epoch: from a
// `retry-after` header (seconds or a date), from "Try again in 9 hours" in
// Surge's message, or `fallbackMs` from now.
const UNIT_MS = { second: 1_000, minute: 60_000, hour: 3_600_000, day: 86_400_000 };
export function retryAtFrom(response, message, fallbackMs) {
  const header = response?.headers?.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Date.now() + seconds * 1000;
    const date = Date.parse(header);
    if (Number.isFinite(date)) return date;
  }
  const match = /try again in (\d+) (second|minute|hour|day)s?/i.exec(message || '');
  if (match) return Date.now() + Number(match[1]) * UNIT_MS[match[2].toLowerCase()];
  return Date.now() + fallbackMs;
}

// Let's Encrypt's limits, as Surge passes them on: 5 failed checks per
// domain an hour, 5 identical certificates a week, 50 a week per domain.
const CERT_LIMIT_RE = /too many (failed )?(authorizations|certificates|requests|registrations)|rate ?limit/i;

// Asks Surge for a certificate for a custom domain: PUT /<domain>/encrypt,
// the same call as `surge <domain> debug encrypt`. Only for when Surge has
// been stuck securing a domain for a while (useDomainStatus asks once by
// itself, then only when the user does, at most every 30 minutes). Like
// publish, the reply is a stream of JSON lines, and it always ends with an
// `info` line: its `certs` list is empty when no certificate was issued
// (surge-docs/api-deploys.md).
//   -> { issued: true } or { error, retryAt?, signedOut? }
async function encrypt({ domain }, tokens, fetchImpl) {
  const token = tokenOf(tokens);
  if (!token) return json({ error: 'Sign in to Surge first.', signedOut: true }, 401);
  const site = normalizeSiteHost(domain);
  if (!site) return json({ error: addressProblem(domain) }, 400);
  if (!site.custom) return json({ issued: true });
  const { host } = site;
  let response;
  try {
    response = await fetchImpl(`${SURGE_API}/${host}/encrypt`, {
      method: 'PUT',
      headers: {
        authorization: basicAuth('token', token),
        accept: 'application/x-ndjson',
        version: SURGE_CLIENT_VERSION,
        timestamp: new Date().toISOString(),
      },
      // Let's Encrypt checks the domain while the request is open.
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return json({ error: 'Couldn’t reach Surge. Try again in a minute.' }, 502);
  }
  if (response.status === 401) {
    await tokens.clear();
    return json({ error: 'Your Surge sign-in has expired. Sign in again.', signedOut: true }, 401);
  }
  if (!response.ok) {
    const reason = await surgeReason(response);
    if (response.status === 429 || CERT_LIMIT_RE.test(reason)) {
      return json({ error: reason || 'Too many certificate requests for this domain.', retryAt: retryAtFrom(response, reason, 3_600_000) }, 429);
    }
    if (response.status === 404) return json({ error: `Surge has no site at ${host}. Publish it again.` }, 400);
    if (response.status === 405) return json({ error: `Surge can’t request a certificate for ${host}.` }, 400);
    return json({ error: reason || `Surge couldn’t request the certificate (error ${response.status}). Try again in a minute.` }, 502);
  }
  let text = '';
  try {
    text = await response.text();
  } catch {
    return json({ error: 'The connection to Surge dropped. Try again in a minute.' }, 502);
  }
  const events = parseEvents(text);
  const failure = events.find((event) => event.type === 'error' || event.messages || event.errors);
  const message = failure ? eventMessage(failure) : '';
  if (message && CERT_LIMIT_RE.test(message)) {
    return json({ error: message, retryAt: retryAtFrom(null, message, 3_600_000) }, 429);
  }
  const info = events.find((event) => event.type === 'info');
  if (info && Array.isArray(info.certs) && info.certs.length) return json({ issued: true });
  return json({
    error: message || `Surge couldn’t get a certificate for ${host} yet. This usually means the new DNS records haven’t reached everyone yet.`,
  }, 502);
}

// Resends the account's verification email (`surge verify`). A new
// account's domains are held at 'ready' until it's verified. Surge answers
// { verified: true } when there's nothing to verify, { sent: true } when it
// sent the email, or { sent: false, msg } within five minutes of the last.
//   -> { sent, verified?, message? } or { error, signedOut? }
async function verify(_body, tokens, fetchImpl) {
  const { id: email } = tokens.describe();
  const token = tokenOf(tokens);
  if (!token) return json({ error: 'Sign in to Surge first.', signedOut: true }, 401);
  let response;
  try {
    response = await fetchImpl(`${SURGE_API}/verification`, {
      method: 'POST',
      headers: { authorization: basicAuth('token', token), accept: 'application/json', version: SURGE_CLIENT_VERSION },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return json({ error: 'Couldn’t reach Surge. Try again.' }, 502);
  }
  if (response.status === 401) {
    await tokens.clear();
    return json({ error: 'Your Surge sign-in has expired. Sign in again.', signedOut: true }, 401);
  }
  if (!response.ok) {
    const reason = await surgeReason(response);
    return json({ error: reason || `Surge couldn’t send the email (error ${response.status}). Try again.` }, 502);
  }
  let body = null;
  try {
    body = await response.json();
  } catch { /* an empty reply: assume it was sent */ }
  if (body?.verified === true) return json({ sent: false, verified: true, email });
  if (body?.sent === false) {
    return json({ sent: false, email, message: typeof body.msg === 'string' && body.msg ? body.msg : 'Surge sent one a few minutes ago. Check your inbox and spam folder.' });
  }
  return json({ sent: true, email });
}

export async function handleSurgeApi(request, env, tokens, { fetch: fetchImpl = globalThis.fetch } = {}) {
  // Only AppBlips' own page may publish with the saved token. A JSON body
  // also forces a CORS preflight, which other sites can't pass.
  if (isForeignOrigin(request, env)) return json({ error: 'Not allowed.' }, 403);
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  const readBody = async () => {
    if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) return null;
    try {
      const body = await request.json();
      return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
    } catch {
      return null;
    }
  };
  const status = () => {
    const { id, hasKey } = tokens.describe();
    return { email: hasKey ? id : '', signedIn: hasKey };
  };

  if (path === '/api/surge') {
    if (request.method === 'GET') return json(status());
    if (request.method === 'DELETE') {
      await tokens.clear();
      return json(status());
    }
    return json({ error: 'Method not allowed.' }, 405);
  }
  const actions = { '/api/surge/login': login, '/api/surge/publish': publish, '/api/surge/unpublish': unpublish, '/api/surge/domain': domainStatus, '/api/surge/encrypt': encrypt, '/api/surge/verify': verify };
  if (actions[path]) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    const body = await readBody();
    if (!body) return json({ error: 'Invalid request.' }, 400);
    return actions[path](body, tokens, fetchImpl);
  }
  return json({ error: 'Not found.' }, 404);
}
