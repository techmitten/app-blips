// Publish to Surge (electron/server/surgeApi.js, tar.js): the tar layout, the
// address rules and the replies the page sees, against a stubbed Surge.
// No network. Run: node testing/testSurgeApi.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { createTar, gzip } from '../electron/server/tar.js';
import { handleSurgeApi, isCloudflareIp } from '../electron/server/surgeApi.js';
import { dnsRecordFor, dnsRecordsFor, latestPreviewUrl, normalizeSiteHost, siteHost, siteUrl } from '../src/lib/siteAddress.js';
import { addFaviconLinks } from '../src/lib/favicon.js';

const ORIGIN = 'http://localhost:5175';

// The same shape as browserKeys.js's stores, in memory.
const memoryTokens = (email = '', token = '') => {
  let state = { id: email, key: token };
  return {
    describe: () => ({ id: state.id, hasKey: Boolean(state.key) }),
    keyFor: (id) => (id && id === state.id ? state.key : ''),
    save: async (id, key) => { state = { id, key }; },
    clear: async () => { state = { id: '', key: '' }; },
  };
};

const request = (path, { method = 'GET', body, origin = ORIGIN } = {}) => new Request(`${ORIGIN}${path}`, {
  method,
  headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(origin ? { origin } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

// Reads a ustar archive back into [{ name, text }], checking each checksum.
const readTar = (bytes) => {
  const files = [];
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start, length) => new TextDecoder().decode(header.subarray(start, start + length)).replace(/\0.*$/s, '');
    const size = parseInt(field(124, 12), 8);
    const copy = Uint8Array.from(header);
    copy.fill(0x20, 148, 156);
    assert.equal(parseInt(field(148, 8), 8), copy.reduce((a, b) => a + b, 0), 'checksum');
    assert.equal(field(257, 6), 'ustar');
    files.push({ name: field(0, 100), text: new TextDecoder().decode(bytes.subarray(offset + 512, offset + 512 + size)) });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
};

test('tar round-trips names and contents, gzip is real gzip', async () => {
  const entries = [
    { name: 'site/index.html', data: '<h1>Héllo</h1>' },
    { name: 'site/about.html', data: 'x'.repeat(1300) },
  ];
  const files = readTar(gunzipSync(await gzip(createTar(entries))));
  assert.deepEqual(files, entries.map(({ name, data }) => ({ name, text: data })));
});

test('addresses: names become <name>.surge.sh, domains stay custom, anything else is refused', () => {
  const surge = (host) => ({ host, custom: false });
  const custom = (host) => ({ host, custom: true });
  assert.deepEqual(normalizeSiteHost('my-site'), surge('my-site.surge.sh'));
  assert.deepEqual(normalizeSiteHost(' My-Site.surge.sh '), surge('my-site.surge.sh'));
  assert.deepEqual(normalizeSiteHost('https://my-site.surge.sh/'), surge('my-site.surge.sh'));
  assert.deepEqual(normalizeSiteHost('example.com'), custom('example.com'));
  assert.deepEqual(normalizeSiteHost('https://WWW.My-Shop.co.uk/about'), custom('www.my-shop.co.uk'));
  assert.deepEqual(normalizeSiteHost('shop.example.'), custom('shop.example'));
  const long = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(59)}.com`;
  assert.equal(long.length, 255);
  for (const bad of ['', '-site', 'site-', 'my_site', 'x'.repeat(64), 'a.b.surge.sh', '.surge.sh',
    '1.2.3.4', '-x.com', 'x-.com', 'x..com', 'x.c0m', 'x.c', 'my shop.com', long]) {
    assert.equal(normalizeSiteHost(bad), null, bad);
  }
});

test('custom domains: the DNS record to add, and stored names read back as addresses', () => {
  assert.deepEqual(dnsRecordFor('example.com'), { type: 'A', name: '@', value: '138.197.235.123', root: true });
  assert.deepEqual(dnsRecordFor('www.example.com'), { type: 'CNAME', name: 'www', value: 'geo.surge.world', root: false });
  assert.deepEqual(dnsRecordFor('a.b.example.com').name, 'a.b');
  assert.equal(siteHost('my-site'), 'my-site.surge.sh');
  assert.equal(siteUrl('my-site'), 'https://my-site.surge.sh');
  assert.equal(siteHost('www.example.com'), 'www.example.com');
  assert.equal(siteUrl('www.example.com'), 'https://www.example.com');
  assert.equal(siteUrl(''), '');
});

test('other sites may not use the saved sign-in', async () => {
  const response = await handleSurgeApi(request('/api/surge', { origin: 'https://evil.example' }), {}, memoryTokens('a@b.co', 't'));
  assert.equal(response.status, 403);
});

test('status shows the email, never the token', async () => {
  const body = await (await handleSurgeApi(request('/api/surge'), {}, memoryTokens('a@b.co', 'secret'))).json();
  assert.deepEqual(body, { email: 'a@b.co', signedIn: true });
});

test('login keeps only the token Surge returns', async () => {
  const tokens = memoryTokens();
  let seen;
  const fetch = async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ email: 'a@b.co', token: 'tok123' }), { status: 201 });
  };
  const body = await (await handleSurgeApi(request('/api/surge/login', { method: 'POST', body: { email: 'a@b.co', password: 'pw' } }), {}, tokens, { fetch })).json();
  assert.deepEqual(body, { email: 'a@b.co', signedIn: true });
  assert.equal(seen.url, 'https://surge.surge.sh/token');
  assert.equal(seen.init.headers.authorization, 'Basic ' + btoa('a@b.co:pw'));
  assert.equal(tokens.keyFor('a@b.co'), 'tok123');
});

test('a wrong password is explained and nothing is saved', async () => {
  const tokens = memoryTokens();
  const fetch = async () => new Response('', { status: 401 });
  const response = await handleSurgeApi(request('/api/surge/login', { method: 'POST', body: { email: 'a@b.co', password: 'pw' } }), {}, tokens, { fetch });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /password/);
  assert.equal(tokens.describe().hasKey, false);
});

const publishRequest = (files = { 'index.html': '<p>hi</p>', 'about.html': '<p>about</p>' }) => (
  request('/api/surge/publish', { method: 'POST', body: { domain: 'my-site', files } })
);

test('publish uploads site/<page> to the address and returns the https link', async () => {
  let seen;
  const fetch = async (url, init) => {
    seen = { url, init };
    return new Response('{"type":"progress","id":"upload"}\n{"type":"info","domain":"my-site.surge.sh"}\n', { status: 200 });
  };
  const body = await (await handleSurgeApi(publishRequest(), {}, memoryTokens('a@b.co', 'tok'), { fetch })).json();
  assert.deepEqual(body, { url: 'https://my-site.surge.sh', domain: 'my-site.surge.sh' });
  assert.equal(seen.url, 'https://surge.surge.sh/my-site.surge.sh');
  assert.equal(seen.init.method, 'PUT');
  assert.equal(seen.init.headers.authorization, 'Basic ' + btoa('token:tok'));
  assert.equal(seen.init.headers['file-count'], '2');
  const names = readTar(gunzipSync(seen.init.body)).map((f) => f.name).sort();
  assert.deepEqual(names, ['site/about.html', 'site/index.html']);
});

test('publish to a custom domain returns its link and the DNS record it needs', async () => {
  let seen;
  let upload;
  const fetch = async (url, init) => {
    seen = url;
    upload = init;
    return new Response('{"type":"info"}\n', { status: 200 });
  };
  const publishTo = async (domain) => (await handleSurgeApi(
    request('/api/surge/publish', { method: 'POST', body: { domain, files: { 'index.html': 'x' } } }),
    {}, memoryTokens('a@b.co', 'tok'), { fetch },
  )).json();
  assert.deepEqual(await publishTo('www.example.com'), {
    url: 'https://www.example.com', domain: 'www.example.com', custom: true,
    dns: { type: 'CNAME', name: 'www', value: 'geo.surge.world', root: false },
  });
  assert.equal(seen, 'https://surge.surge.sh/www.example.com');
  // The project carries a CNAME file naming the domain, counted in file-count.
  const files = readTar(gunzipSync(upload.body));
  assert.deepEqual(files.find((f) => f.name === 'site/CNAME'), { name: 'site/CNAME', text: 'www.example.com\n' });
  assert.equal(upload.headers['file-count'], String(files.length));
  assert.equal((await publishTo('example.com')).dns.type, 'A');
  assert.match((await publishTo('bad..com')).error, /domain you own/);
  assert.match((await publishTo('my_site')).error, /lowercase letters/);
});

test('a custom domain on another account is explained', async () => {
  const fetch = async () => new Response('', { status: 403 });
  const response = await handleSurgeApi(
    request('/api/surge/publish', { method: 'POST', body: { domain: 'example.com', files: { 'index.html': 'x' } } }),
    {}, memoryTokens('a@b.co', 'tok'), { fetch },
  );
  assert.match((await response.json()).error, /example\.com is already used by another Surge account/);
});

test('publish uploads copied Pollinations images next to the pages, and refuses other paths', async () => {
  let seen;
  const fetch = async (url, init) => {
    seen = init;
    return new Response('{"type":"info"}\n', { status: 200 });
  };
  const images = { 'images/abc123.jpg': btoa('JPEG') };
  const ok = await handleSurgeApi(
    request('/api/surge/publish', { method: 'POST', body: { domain: 'my-site', files: { 'index.html': '<img src="images/abc123.jpg">' }, images } }),
    {}, memoryTokens('a@b.co', 'tok'), { fetch },
  );
  assert.equal(ok.status, 200);
  const files = readTar(gunzipSync(seen.body));
  assert.deepEqual(files.map((f) => f.name).sort(), ['site/images/abc123.jpg', 'site/index.html']);
  assert.equal(files.find((f) => f.name === 'site/images/abc123.jpg').text, 'JPEG');
  assert.equal(seen.headers['file-count'], '2');

  for (const bad of [{ '../x.jpg': 'AA==' }, { 'images/x.exe': 'AA==' }, { 'images/x.jpg': 'not base64!' }, ['x']]) {
    const response = await handleSurgeApi(
      request('/api/surge/publish', { method: 'POST', body: { domain: 'my-site', files: { 'index.html': 'x' }, images: bad } }),
      {}, memoryTokens('a@b.co', 'tok'), { fetch: () => assert.fail('no upload') },
    );
    assert.equal(response.status, 400, JSON.stringify(bad));
  }
});

test('publish adds the SEO connector\'s sitemap.xml and robots.txt, and refuses any other extra file', async () => {
  let seen;
  const fetch = async (url, init) => {
    seen = init;
    return new Response('{"type":"info"}\n', { status: 200 });
  };
  const extras = { 'sitemap.xml': '<urlset/>', 'robots.txt': 'User-agent: *\nAllow: /\n' };
  const ok = await handleSurgeApi(
    request('/api/surge/publish', { method: 'POST', body: { domain: 'my-site', files: { 'index.html': 'x' }, extras } }),
    {}, memoryTokens('a@b.co', 'tok'), { fetch },
  );
  assert.equal(ok.status, 200);
  const files = readTar(gunzipSync(seen.body));
  assert.deepEqual(files.map((f) => f.name).sort(), ['site/index.html', 'site/robots.txt', 'site/sitemap.xml']);
  assert.equal(files.find((f) => f.name === 'site/sitemap.xml').text, '<urlset/>');
  assert.equal(seen.headers['file-count'], '3');

  for (const bad of [{ '../x.xml': 'x' }, { 'evil.html': '<script>' }, { 'robots.txt': 5 }, { 'robots.txt': 'x'.repeat(300_000) }, ['x']]) {
    const response = await handleSurgeApi(
      request('/api/surge/publish', { method: 'POST', body: { domain: 'my-site', files: { 'index.html': 'x' }, extras: bad } }),
      {}, memoryTokens('a@b.co', 'tok'), { fetch: () => assert.fail('no upload') },
    );
    assert.equal(response.status, 400, JSON.stringify(bad).slice(0, 60));
  }
});

test('publish uploads the site icon as favicon.png, within its size cap', async () => {
  let seen;
  const fetch = async (url, init) => {
    seen = init;
    return new Response('{"type":"info"}\n', { status: 200 });
  };
  const ok = await handleSurgeApi(
    request('/api/surge/publish', { method: 'POST', body: { domain: 'my-site', files: { 'index.html': 'x' }, images: { 'favicon.png': btoa('PNG') } } }),
    {}, memoryTokens('a@b.co', 'tok'), { fetch },
  );
  assert.equal(ok.status, 200);
  assert.deepEqual(readTar(gunzipSync(seen.body)).map((f) => f.name).sort(), ['site/favicon.png', 'site/index.html']);

  const big = await handleSurgeApi(
    request('/api/surge/publish', { method: 'POST', body: { domain: 'my-site', files: { 'index.html': 'x' }, images: { 'favicon.png': btoa('x'.repeat(300 * 1024)) } } }),
    {}, memoryTokens('a@b.co', 'tok'), { fetch: () => assert.fail('no upload') },
  );
  assert.equal(big.status, 400);
});

test('site icon links replace the page\'s own icons, in the <head> only', () => {
  const page = '<!DOCTYPE html>\n<html><head>\n<meta charset="utf-8">\n<link rel="icon" href="data:,">\n<LINK REL=\'shortcut icon\' href="a.ico">\n<link rel="stylesheet" href="s.css">\n</head><body><header>Hi</header><script>const t = \'<link rel="icon">\';</script></body></html>';
  const out = addFaviconLinks(page);
  assert.equal((out.match(/rel="icon"/g) || []).length, 2, 'ours plus the one inside the script');
  assert.ok(out.includes('<link rel="icon" type="image/png" href="/favicon.png">'));
  assert.ok(out.includes('<link rel="apple-touch-icon" href="/favicon.png">'));
  assert.ok(!out.includes('a.ico') && !out.includes('data:,'));
  assert.ok(out.includes('rel="stylesheet"') && out.includes('<header>Hi</header>'));
  assert.ok(out.indexOf('favicon.png') > out.indexOf('<head>') && out.indexOf('favicon.png') < out.indexOf('</head>'));

  const noHead = addFaviconLinks('<!doctype html><html lang="en"><body>x</body></html>');
  assert.match(noHead, /^<!doctype html><html lang="en"><head>\n<link rel="icon"[^]*<\/head>\n<body>x/);
  assert.match(addFaviconLinks('<!doctype html><p>x</p>'), /^<!doctype html><link rel="icon"/);
});

test('publish without signing in asks for a sign-in', async () => {
  const response = await handleSurgeApi(publishRequest(), {}, memoryTokens(), { fetch: () => assert.fail('no upload') });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).signedOut, true);
});

test('bad page names and missing index.html are refused before uploading', async () => {
  const fetch = () => assert.fail('no upload');
  for (const files of [{ 'about.html': 'x' }, { 'index.html': 'x', '../evil.html': 'x' }]) {
    const response = await handleSurgeApi(publishRequest(files), {}, memoryTokens('a@b.co', 'tok'), { fetch });
    assert.equal(response.status, 400);
  }
});

test('an expired token is forgotten', async () => {
  const tokens = memoryTokens('a@b.co', 'tok');
  const response = await handleSurgeApi(publishRequest(), {}, tokens, { fetch: async () => new Response('', { status: 401 }) });
  assert.equal((await response.json()).signedOut, true);
  assert.equal(tokens.describe().hasKey, false);
});

test('a taken address passes on Surge’s reason, or explains it', async () => {
  const withReason = async () => new Response('', { status: 403, headers: { reason: 'Rate limited' } });
  assert.equal((await (await handleSurgeApi(publishRequest(), {}, memoryTokens('a@b.co', 'tok'), { fetch: withReason })).json()).error, 'Rate limited');
  const bare = async () => new Response('', { status: 403 });
  assert.match((await (await handleSurgeApi(publishRequest(), {}, memoryTokens('a@b.co', 'tok'), { fetch: bare })).json()).error, /another Surge account/);
});

test('a stream with no info line is a failure', async () => {
  const fetch = async () => new Response('{"type":"progress","id":"upload"}\n', { status: 200 });
  const response = await handleSurgeApi(publishRequest(), {}, memoryTokens('a@b.co', 'tok'), { fetch });
  assert.equal(response.status, 502);
});

const unpublishRequest = (domain = 'my-site') => request('/api/surge/unpublish', { method: 'POST', body: { domain } });

test('unpublish deletes the address with the saved token', async () => {
  let seen;
  const fetch = async (url, init) => {
    seen = { url, init };
    return new Response('{"msg":"project removed"}', { status: 200 });
  };
  const body = await (await handleSurgeApi(unpublishRequest(), {}, memoryTokens('a@b.co', 'tok'), { fetch })).json();
  assert.deepEqual(body, { removed: true });
  assert.equal(seen.url, 'https://surge.surge.sh/my-site.surge.sh');
  assert.equal(seen.init.method, 'DELETE');
  assert.equal(seen.init.headers.authorization, 'Basic ' + btoa('token:tok'));
});

test('unpublish takes a custom domain offline too', async () => {
  let seen;
  const fetch = async (url) => {
    seen = url;
    return new Response('{}', { status: 200 });
  };
  assert.deepEqual(await (await handleSurgeApi(unpublishRequest('www.example.com'), {}, memoryTokens('a@b.co', 'tok'), { fetch })).json(), { removed: true });
  assert.equal(seen, 'https://surge.surge.sh/www.example.com');
});

test('unpublishing a site that is already gone counts as done', async () => {
  const fetch = async () => new Response('', { status: 404 });
  assert.deepEqual(await (await handleSurgeApi(unpublishRequest(), {}, memoryTokens('a@b.co', 'tok'), { fetch })).json(), { removed: true });
});

test('unpublish refuses bad addresses, someone else’s site and a missing sign-in', async () => {
  const noFetch = () => assert.fail('no request');
  assert.equal((await handleSurgeApi(unpublishRequest('a.b.surge.sh'), {}, memoryTokens('a@b.co', 'tok'), { fetch: noFetch })).status, 400);
  assert.equal((await (await handleSurgeApi(unpublishRequest(), {}, memoryTokens(), { fetch: noFetch })).json()).signedOut, true);
  const taken = async () => new Response('', { status: 403 });
  assert.match((await (await handleSurgeApi(unpublishRequest(), {}, memoryTokens('a@b.co', 'tok'), { fetch: taken })).json()).error, /another Surge account/);
});

// Domain status (domainStatus): a stubbed DNS-over-HTTPS resolver. `zone`
// maps "name type" to the Answer records it returns.
const dohFetch = (zone, { failCloudflare = false } = {}) => {
  const seen = [];
  const fetch = async (url) => {
    const { hostname, searchParams } = new URL(url);
    seen.push(hostname);
    if (failCloudflare && hostname === 'cloudflare-dns.com') throw new Error('offline');
    const Answer = zone[`${searchParams.get('name')} ${searchParams.get('type')}`];
    return new Response(JSON.stringify({ Status: Answer ? 0 : 3, ...(Answer ? { Answer } : {}) }), { status: 200 });
  };
  return { fetch, seen };
};
// The resolver above, Surge's API (`surge`: JSON bodies by path) and the
// site itself (`site`: a function returning its Response; none = the TLS
// handshake fails).
const domainFetch = ({ zone = {}, surge = {}, site } = {}) => {
  const seen = [];
  const doh = dohFetch(zone);
  const fetch = async (url, init) => {
    const { hostname, pathname } = new URL(url);
    seen.push({ url: `${hostname}${pathname}`, init });
    if (hostname === 'cloudflare-dns.com' || hostname === 'dns.google') return doh.fetch(url);
    if (hostname === 'surge.surge.sh') {
      const body = surge[pathname];
      return body === undefined ? new Response('', { status: 404 }) : new Response(JSON.stringify(body), { status: 200 });
    }
    if (!site) throw new TypeError('fetch failed');
    return site(hostname, init);
  };
  return { fetch, seen };
};
const domainRequest = (domain) => request('/api/surge/domain', { method: 'POST', body: { domain } });
const statusOf = async (domain, setup, tokens = memoryTokens('a@b.co', 'tok')) => (
  (await handleSurgeApi(domainRequest(domain), {}, tokens, domainFetch(setup))).json()
);
const answersWith = (headers) => () => new Response(null, { status: 200, headers });

test('Cloudflare’s address ranges are recognised', () => {
  assert.equal(isCloudflareIp('104.21.3.4'), true);
  assert.equal(isCloudflareIp('172.67.10.1'), true);
  assert.equal(isCloudflareIp('138.197.235.123'), false);
  assert.equal(isCloudflareIp('not an ip'), false);
});

test('Domain status: a CNAME, any Surge server, a flattened CNAME or Surge’s name servers count as connected', async () => {
  const cname = await statusOf('www.shop.com', { zone: { 'www.shop.com A': [{ type: 5, data: 'geo.surge.world.', TTL: 300 }, { type: 1, data: '1.1.1.9', TTL: 60 }] } });
  assert.equal(cname.dns.status, 'connected');
  assert.equal(cname.dns.ttl, 60);
  assert.equal((await statusOf('www.shop.com', { zone: { 'www.shop.com A': [{ type: 5, data: 'na-west1.surge.sh.' }] } })).dns.status, 'connected');
  assert.equal((await statusOf('shop.com', { zone: { 'shop.com A': [{ type: 1, data: '138.197.235.123' }] } })).dns.status, 'connected');
  // London's server is as good as San Francisco's.
  assert.equal((await statusOf('shop.com', { zone: { 'shop.com A': [{ type: 1, data: '46.101.67.123' }] } })).dns.status, 'connected');
  const flattened = { 'shop.com A': [{ type: 1, data: '1.2.3.4' }], 'geo.surge.world A': [{ type: 1, data: '1.2.3.4' }] };
  assert.equal((await statusOf('shop.com', { zone: flattened })).dns.status, 'connected');
  const delegated = { 'www.shop.com A': [{ type: 1, data: '5.6.7.8' }], 'shop.com NS': [{ type: 2, data: 'ns1.surge.world.' }] };
  const viaNs = await statusOf('www.shop.com', { zone: delegated });
  assert.equal(viaNs.dns.status, 'connected');
  assert.equal(viaNs.provider, 'surge');
});

test('Domain status: no record is missing, another host is elsewhere with its TTL, a root domain checks www too', async () => {
  const empty = await statusOf('shop.com', {});
  assert.deepEqual(empty.dns, { status: 'missing', cname: [], ips: [], ttl: null });
  assert.equal(empty.www.status, 'missing');
  const parked = {
    'shop.com A': [{ type: 1, data: '9.9.9.9', TTL: 3600 }],
    'geo.surge.world A': [{ type: 1, data: '1.2.3.4' }],
    'www.shop.com A': [{ type: 5, data: 'geo.surge.world.' }],
  };
  const body = await statusOf('shop.com', { zone: parked });
  assert.deepEqual(body.dns, { status: 'elsewhere', cname: [], ips: ['9.9.9.9'], ttl: 3600 });
  assert.equal(body.www.status, 'connected');
  assert.equal((await statusOf('www.shop.com', {})).www, undefined);
});

test('Domain status: Cloudflare’s proxy and name servers are recognised', async () => {
  const zone = { 'shop.com A': [{ type: 1, data: '104.21.3.4' }], 'shop.com NS': [{ type: 2, data: 'ada.ns.cloudflare.com.' }] };
  const proxied = await statusOf('shop.com', { zone, site: answersWith({ server: 'cloudflare', 'cf-ray': '1-EWR' }) });
  assert.equal(proxied.provider, 'cloudflare');
  assert.equal(proxied.dns.status, 'proxied');
  assert.deepEqual(proxied.https, { ok: false, via: 'cloudflare' });
  const greyCloud = await statusOf('shop.com', { zone: { ...zone, 'shop.com A': [{ type: 1, data: '138.197.235.123' }] } });
  assert.equal(greyCloud.dns.status, 'connected');
  assert.equal(greyCloud.provider, 'cloudflare');
  const ownZone = await statusOf('shop.com', { zone: { ...zone, 'shop.com NS': [{ type: 2, data: 'ns3.cloudflare.com.' }] } });
  assert.equal(ownZone.provider, 'cloudflare');
});

test('Domain status: Surge’s address next to another A or AAAA record is mixed', async () => {
  const twoHosts = await statusOf('shop.com', { zone: { 'shop.com A': [{ type: 1, data: '138.197.235.123' }, { type: 1, data: '9.9.9.9' }], 'geo.surge.world A': [{ type: 1, data: '1.2.3.4' }] } });
  assert.equal(twoHosts.dns.status, 'mixed');
  assert.deepEqual(twoHosts.dns.extra, ['9.9.9.9']);
  const ipv6 = await statusOf('shop.com', { zone: { 'shop.com A': [{ type: 1, data: '138.197.235.123' }], 'shop.com AAAA': [{ type: 28, data: '2001:db8::1' }] } });
  assert.equal(ipv6.dns.status, 'mixed');
  assert.deepEqual(ipv6.dns.extra, ['2001:db8::1']);
});

test('Domain status: adds Surge’s state, its certificate and who answers over HTTPS', async () => {
  const zone = { 'shop.com A': [{ type: 1, data: '138.197.235.123' }] };
  const surge = {
    '/shop.com/status': { status: 'securing' },
    '/shop.com/certs': [{ issuer: 'Let’s Encrypt', altnames: ['shop.com', 'www.shop.com'], expiresInWords: '89 days' }],
  };
  const setup = domainFetch({ zone, surge, site: answersWith({ server: 'Surge' }) });
  const secure = await (await handleSurgeApi(domainRequest('shop.com'), {}, memoryTokens('a@b.co', 'tok'), setup)).json();
  assert.deepEqual(secure.surge, { status: 'securing', reason: '' });
  assert.deepEqual(secure.cert, { issued: true, issuer: 'Let’s Encrypt', expires: '89 days' });
  assert.deepEqual(secure.https, { ok: true, via: 'surge' });
  assert.equal(secure.signedOut, undefined);
  const statusCall = setup.seen.find((call) => call.url === 'surge.surge.sh/shop.com/status');
  assert.equal(statusCall.init.headers.authorization, `Basic ${btoa('token:tok')}`);
  // Nothing asks for a certificate while checking.
  assert.ok(!setup.seen.some((call) => call.url.endsWith('/encrypt')));
  // 'waiting on dns' reads as waiting; a certificate for other names isn't this one's.
  const waiting = await statusOf('shop.com', { zone, surge: { '/shop.com/status': { status: 'waiting on dns' }, '/shop.com/certs': { certs: [{ altnames: ['*.surge.sh'] }] } } });
  assert.equal(waiting.surge.status, 'waiting');
  assert.equal(waiting.cert.issued, false);
  assert.deepEqual(waiting.https, { ok: false, via: null });
  // An old host still answering isn't Surge.
  assert.deepEqual((await statusOf('shop.com', { zone, site: answersWith({ server: 'nginx' }) })).https, { ok: false, via: 'other' });
  // Signed out: Surge isn't asked.
  const { fetch, seen } = domainFetch({ zone });
  const out = await (await handleSurgeApi(domainRequest('shop.com'), {}, memoryTokens(), { fetch })).json();
  assert.equal(out.signedOut, true);
  assert.equal(out.surge, null);
  assert.ok(!seen.some((call) => call.url.startsWith('surge.surge.sh')));
});

test('Domain status: falls back to the second resolver; surge.sh addresses and bad names are refused', async () => {
  const zone = { 'shop.com A': [{ type: 1, data: '138.197.235.123' }] };
  const { fetch, seen } = dohFetch(zone, { failCloudflare: true });
  const viaGoogle = async (url, init) => (new URL(url).hostname === 'shop.com' ? Promise.reject(new TypeError('fetch failed')) : fetch(url, init));
  assert.equal((await (await handleSurgeApi(domainRequest('shop.com'), {}, memoryTokens(), { fetch: viaGoogle })).json()).dns.status, 'connected');
  assert.ok(seen.includes('dns.google'));
  const offline = async () => { throw new Error('offline'); };
  assert.equal((await (await handleSurgeApi(domainRequest('shop.com'), {}, memoryTokens(), { fetch: offline })).json()).dns.status, 'unknown');
  for (const domain of ['my-site', 'bad..com']) {
    const response = await handleSurgeApi(domainRequest(domain), {}, memoryTokens(), { fetch: () => assert.fail('no lookup') });
    assert.equal(response.status, 400);
  }
});

// Certificate request (encrypt): PUT /<domain>/encrypt with the token, like
// `surge <domain> debug encrypt`; the reply is JSON lines ending in `info`.
const encryptRequest = (domain = 'www.shop.com') => request('/api/surge/encrypt', { method: 'POST', body: { domain } });
const encryptWith = async (reply, tokens = memoryTokens('a@b.co', 'tok')) => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return reply(); };
  const response = await handleSurgeApi(encryptRequest(), {}, tokens, { fetch });
  return { body: await response.json(), status: response.status, calls };
};

test('Certificate request: issued only when Surge lists a certificate', async () => {
  const { body, calls } = await encryptWith(() => new Response('{"type":"progress"}\n{"type":"info","certs":[{"altnames":["www.shop.com"]}]}\n', { status: 200 }));
  assert.deepEqual(body, { issued: true });
  assert.equal(calls[0].url, 'https://surge.surge.sh/www.shop.com/encrypt');
  assert.equal(calls[0].init.method, 'PUT');
  assert.equal(calls[0].init.headers.authorization, `Basic ${btoa('token:tok')}`);
  // `info` always comes; an empty list means nothing was issued.
  const none = await encryptWith(() => new Response('{"type":"info","certs":[]}\n', { status: 200 }));
  assert.equal(none.status, 502);
  assert.match(none.body.error, /haven’t reached everyone/);
});

test('Certificate request: Let’s Encrypt’s limits come back with when to retry', async () => {
  const before = Date.now();
  const limited = await encryptWith(() => new Response('{"type":"error","error":{"message":"too many failed authorizations recently"}}\n', { status: 200 }));
  assert.equal(limited.status, 429);
  assert.ok(limited.body.retryAt >= before + 3_600_000);
  const inMessage = await encryptWith(() => new Response(JSON.stringify({ message: 'Rate limited. Try again in 2 hours.' }), { status: 429 }));
  assert.ok(inMessage.body.retryAt >= before + 2 * 3_600_000 && inMessage.body.retryAt < before + 3 * 3_600_000);
  const inHeader = await encryptWith(() => new Response('{}', { status: 429, headers: { 'retry-after': '120' } }));
  assert.ok(inHeader.body.retryAt >= before + 120_000 && inHeader.body.retryAt <= Date.now() + 120_000);
});

test('Certificate request: failures, expired sign-in and surge.sh addresses', async () => {
  const failed = await encryptWith(() => new Response('{"type":"error","error":{"message":"DNS not ready"}}\n', { status: 200 }));
  assert.equal(failed.status, 502);
  assert.match(failed.body.error, /DNS not ready/);
  const collect = await encryptWith(() => new Response('{"type":"collect","plan":{"name":"pro"}}\n', { status: 200 }));
  assert.ok(collect.body.error);
  assert.equal(collect.body.needsPlan, undefined);
  assert.match((await encryptWith(() => new Response('', { status: 404 }))).body.error, /no site/);
  assert.match((await encryptWith(() => new Response('', { status: 405 }))).body.error, /can’t request/);
  const expired = await encryptWith(() => new Response('', { status: 401 }));
  assert.equal(expired.body.signedOut, true);
  const signedOut = await encryptWith(() => assert.fail('no request'), memoryTokens());
  assert.equal(signedOut.body.signedOut, true);
  const free = await handleSurgeApi(encryptRequest('my-site'), {}, memoryTokens('a@b.co', 'tok'), { fetch: () => assert.fail('no request') });
  assert.deepEqual(await free.json(), { issued: true });
});

test('DNS records: a root domain also gets www; on Cloudflare, CNAMEs set to DNS only', () => {
  assert.deepEqual(dnsRecordsFor('cirruscode.dev'), [
    { type: 'A', name: '@', value: '138.197.235.123', root: true },
    { type: 'CNAME', name: 'www', value: 'geo.surge.world', root: false },
  ]);
  assert.deepEqual(dnsRecordsFor('cirruscode.dev', { provider: 'cloudflare' }), [
    { type: 'CNAME', name: '@', value: 'geo.surge.world', root: true, proxy: 'DNS only' },
    { type: 'CNAME', name: 'www', value: 'geo.surge.world', root: false, proxy: 'DNS only' },
  ]);
  assert.deepEqual(dnsRecordsFor('www.shop.com'), [{ type: 'CNAME', name: 'www', value: 'geo.surge.world', root: false }]);
  assert.equal(latestPreviewUrl('www.shop.com'), 'https://latest--www--shop--com.surge.sh');
});

test('Verification email: resends with the token and passes on Surge’s answer', async () => {
  const send = async (reply) => {
    const calls = [];
    const fetch = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify(reply), { status: 200 }); };
    const response = await handleSurgeApi(request('/api/surge/verify', { method: 'POST', body: {} }), {}, memoryTokens('a@b.co', 'tok'), { fetch });
    return { body: await response.json(), calls };
  };
  const sent = await send({ verified: false, sent: true });
  assert.deepEqual(sent.body, { sent: true, email: 'a@b.co' });
  assert.equal(sent.calls[0].url, 'https://surge.surge.sh/verification');
  assert.equal(sent.calls[0].init.method, 'POST');
  assert.deepEqual((await send({ verified: true })).body, { sent: false, verified: true, email: 'a@b.co' });
  assert.deepEqual((await send({ verified: false, sent: false, msg: 'Already sent.' })).body, { sent: false, email: 'a@b.co', message: 'Already sent.' });
});

test('publish: rate limits say when to retry, refusals in the stream are read, the preview comes back', async () => {
  const publishWith = async (reply) => (await handleSurgeApi(publishRequest(), {}, memoryTokens('a@b.co', 'tok'), { fetch: async () => reply() })).json();
  const limited = await publishWith(() => new Response(JSON.stringify({ message: 'Rate limited. (domain). Try again in 9 hours.' }), { status: 429, headers: { reason: 'header comes last' } }));
  assert.match(limited.error, /Try again in 9 hours/);
  assert.ok(limited.retryAt > Date.now() + 8 * 3_600_000);
  const refused = await publishWith(() => new Response('{"type":"progress"}\n{"type":"error","error":{"message":"Project too large"}}\n', { status: 200 }));
  assert.match(refused.error, /Project too large/);
  const live = await publishWith(() => new Response('{"type":"info","metadata":{"preview":"1785787164375--my-site.surge.sh"}}\n', { status: 200 }));
  assert.equal(live.preview, 'https://1785787164375--my-site.surge.sh');
});
