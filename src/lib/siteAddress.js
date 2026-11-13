// Publish addresses, shared by the page (lib/surge.js, PublishDialog) and
// electron/server/surgeApi.js: a free <name>.surge.sh address, or a domain
// the user owns. Surge serves a custom domain once its DNS points at Surge,
// with a free HTTPS certificate (surge.sh/docs/platform/custom-domains).

export const SURGE_SUFFIX = '.surge.sh';
// Where a custom domain's DNS points: a CNAME for a subdomain (www.shop.com),
// an A record for a root domain (shop.com), which can't have a CNAME.
export const SURGE_CNAME_TARGET = 'geo.surge.world';
export const SURGE_A_RECORD = '138.197.235.123';
export const MAX_HOST_LENGTH = 253;

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD_RE = /^[a-z]{2,63}$/;

// "my-site", "my-site.surge.sh" -> { host: 'my-site.surge.sh', custom: false };
// "www.shop.com", "https://shop.com/" -> { host, custom: true }; anything else
// (other surge.sh names, IPs, localhost, bad labels) -> null.
export function normalizeSiteHost(input) {
  const name = String(input ?? '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '');
  if (!name) return null;
  if (!name.includes('.') || name.endsWith(SURGE_SUFFIX)) {
    const label = name.endsWith(SURGE_SUFFIX) ? name.slice(0, -SURGE_SUFFIX.length) : name;
    return LABEL_RE.test(label) ? { host: label + SURGE_SUFFIX, custom: false } : null;
  }
  if (name.length > MAX_HOST_LENGTH) return null;
  const labels = name.split('.');
  if (labels.length < 2 || !labels.every((label) => LABEL_RE.test(label)) || !TLD_RE.test(labels.at(-1))) return null;
  return { host: name, custom: true };
}

// The record to add at the domain provider. Two labels reads as a root
// domain; a guess for names like shop.co.uk, so the dialog names both kinds.
export function dnsRecordFor(host) {
  const labels = String(host).split('.');
  return labels.length <= 2
    ? { type: 'A', name: '@', value: SURGE_A_RECORD, root: true }
    : { type: 'CNAME', name: labels.slice(0, -2).join('.'), value: SURGE_CNAME_TARGET, root: false };
}

// What lib/surge.js stores per project: a surge.sh name without the suffix
// ("my-site"), or a custom domain in full ("www.shop.com").
export const isCustomHost = (stored) => String(stored || '').includes('.');
export const siteHost = (stored) => (stored ? (isCustomHost(stored) ? stored : stored + SURGE_SUFFIX) : '');
export const siteUrl = (stored) => (stored ? `https://${siteHost(stored)}` : '');
