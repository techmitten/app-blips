// Who a request comes from, for per-visitor limits on searches paid with the
// server's Unsplash key (unsplashApi.js): the visitor's address, read safely
// from X-Forwarded-For behind proxies.
//
// Proxies append the address that connected to them to X-Forwarded-For, so the
// right end of the list is trustworthy and the left end is whatever the
// visitor wrote. Walking from the right past private addresses (the hosting
// platform's internal hops) gives the address that reached the platform. When
// that is Cloudflare (web.appblips.com is proxied by it), the entry Cloudflare
// added just before it is the visitor.

const v4ToInt = (ip) => {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
    n = n * 256 + Number(part);
  }
  return n;
};
const v6ToBigInt = (ip) => {
  if (!/^[0-9a-f:]+$/i.test(ip) || (ip.match(/::/g) || []).length > 1) return null;
  const [head, tail = ''] = ip.split('::');
  const a = head ? head.split(':') : [];
  const b = ip.includes('::') ? (tail ? tail.split(':') : []) : [];
  const groups = ip.includes('::') ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b] : a;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.reduce((n, g) => (n << 16n) + BigInt(parseInt(g, 16)), 0n);
};
const inCidr = (ip, cidr) => {
  const [base, bitsText] = cidr.split('/');
  const bits = Number(bitsText);
  if (base.includes(':')) {
    const a = v6ToBigInt(ip);
    const b = v6ToBigInt(base);
    if (a == null || b == null) return false;
    const shift = BigInt(128 - bits);
    return a >> shift === b >> shift;
  }
  const a = v4ToInt(ip);
  const b = v4ToInt(base);
  if (a == null || b == null) return false;
  const shift = 32 - bits;
  return Math.floor(a / 2 ** shift) === Math.floor(b / 2 ** shift);
};

const PRIVATE = [
  '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16', '100.64.0.0/10', '0.0.0.0/8',
  '::1/128', 'fc00::/7', 'fe80::/10', '::/128',
];
// https://www.cloudflare.com/ips/ (stable for years).
const CLOUDFLARE = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

const clean = (ip) => {
  let value = String(ip || '').trim().toLowerCase();
  if (value.startsWith('[')) value = value.slice(1, value.indexOf(']'));
  if (value.startsWith('::ffff:') && value.includes('.')) value = value.slice(7);
  // An IPv4 address with a port.
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(value)) value = value.split(':')[0];
  return v4ToInt(value) != null || v6ToBigInt(value) != null ? value : '';
};
const isPrivate = (ip) => PRIVATE.some((cidr) => inCidr(ip, cidr));
const isCloudflare = (ip) => CLOUDFLARE.some((cidr) => inCidr(ip, cidr));

// The visitor's address from X-Forwarded-For and the socket's peer.
export const clientIp = (forwardedFor, peer) => {
  const chain = [...String(forwardedFor || '').split(','), peer].map(clean).filter(Boolean);
  let i = chain.length - 1;
  while (i > 0 && isPrivate(chain[i])) i -= 1;
  if (i > 0 && isCloudflare(chain[i])) i -= 1;
  return chain[i] || '';
};

// The key a visitor is counted under: the address, or its /64 for IPv6.
export const visitorKey = (ip) => {
  const n = ip && ip.includes(':') ? v6ToBigInt(ip) : null;
  return n == null ? ip || 'unknown' : `${(n >> 64n).toString(16)}::/64`;
};
