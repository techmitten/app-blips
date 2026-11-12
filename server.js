// Runs AppBlips in a browser instead of the desktop app: serves the built
// client (dist/) and answers POST /api/chat with the same handler the desktop
// app uses. Started by `npm start` (from source) and by the Docker image.
//
// Single-user like the desktop app: /api/chat has no sign-in and spends the
// configured key, so this listens on 127.0.0.1 unless HOST says otherwise
// (the Docker image listens on 0.0.0.0 inside the container, and
// docker-compose.yml publishes it on 127.0.0.1 only). Projects and the
// Settings → AI provider choice live in the browser's own storage, as in
// `npm run dev`, and so do the saved keys (the AI provider's, Surge's,
// Pollinations', Pixabay's, Tavily's): each request brings its own
// (browserKeys.js), so one server can be shared, as on a Hugging Face Space,
// without one visitor's key reaching another.
//
// Only Node built-ins plus electron/server, so the Docker image ships it as
// one bundled file (scripts/build-server.js) with no node_modules.
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleChatProxy } from './electron/server/chatProxy.js';
import { describeConfig, formatConfigSummary } from './electron/server/configSummary.js';
import { toChatRequest, toFetchRequest, sendWebResponse } from './electron/server/nodeHttp.js';
import { createBrowserKeys, removeLegacyKeyFiles } from './electron/server/browserKeys.js';
import { createFreeLimits, freeLimitsEnabled, clientIp, visitorKey } from './electron/server/freeLimits.js';
import { handleProviderApi } from './electron/server/providerApi.js';
import { handleSurgeApi } from './electron/server/surgeApi.js';
import { handlePollinationsApi } from './electron/server/pollinationsApi.js';
import { handlePixabayApi } from './electron/server/pixabayApi.js';
import { handleTavilyApi } from './electron/server/tavilyApi.js';
import { handleSeoScanApi } from './electron/server/seoScanApi.js';
import { withSavedProvider } from './electron/server/savedProvider.js';
import { hostAllowed } from './electron/server/hosts.js';
import { SECURITY_HEADERS, MIME_TYPES } from './electron/server/staticFiles.js';
import { resolveAddresses } from './electron/server/dnsLookup.js';

// A .env in the folder it starts from, when there is one. Docker passes its
// settings as real environment variables instead; those win over the file.
try {
  process.loadEnvFile();
} catch (err) {
  // No .env is normal: environment only.
  if (err.code !== 'ENOENT') console.warn('[server] could not read .env:', err);
}

const DIST_DIR = fileURLToPath(new URL('./dist', import.meta.url));
const INDEX_FILE = join(DIST_DIR, 'index.html');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const withKeys = createBrowserKeys();
// Limits on the Free option (the .env provider) for a server many people can
// reach; APPBLIPS_FREE_LIMITS=off turns them off (freeLimits.js).
const freeLimits = freeLimitsEnabled(process.env) ? createFreeLimits(process.env) : null;
removeLegacyKeyFiles();

const sendText = (res, status, text, headers = {}) => {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(text);
};
const sendJson = (res, status, body) => {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

async function serveStatic(req, res) {
  let requested;
  try {
    requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    sendText(res, 400, 'Bad request');
    return;
  }
  const safePath = normalize(join(DIST_DIR, requested));
  if (!safePath.startsWith(DIST_DIR + sep) && safePath !== DIST_DIR) {
    sendText(res, 400, 'Bad request');
    return;
  }

  let filePath = requested === '/' ? INDEX_FILE : safePath;
  let info;
  try {
    info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = join(filePath, 'index.html');
      info = await stat(filePath);
    }
  } catch {
    filePath = INDEX_FILE; // SPA fallback
    info = await stat(filePath);
  }

  // Vite's hashed bundles never change under the same name; everything else
  // (index.html above all) is revalidated so an update shows up at once.
  const cacheControl = filePath === INDEX_FILE
    ? 'no-cache'
    : filePath.startsWith(join(DIST_DIR, 'assets') + sep)
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600';
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': cacheControl,
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

const server = createServer((req, res) => {
  if (!hostAllowed(req.headers.host || '')) {
    sendText(res, 403, `This address isn't allowed. To open AppBlips at ${req.headers.host || 'this address'}, add it to APPBLIPS_ALLOWED_HOSTS and restart.`);
    return;
  }

  const fail = (err) => {
    if (err?.status === 413 && !res.headersSent) {
      sendJson(res, 413, { error: err.message });
      return;
    }
    console.error('[server] request failed:', req.url, err);
    if (!res.headersSent) sendText(res, 500, 'Internal error.');
    else res.destroy();
  };

  if (req.url === '/api/chat') {
    if (req.method !== 'POST') {
      sendText(res, 405, 'Method not allowed');
      return;
    }
    const handle = async () => {
      const incoming = await toChatRequest(req, res);
      const ip = clientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress);
      // For checking how a hosting platform forwards addresses; off by default.
      if (process.env.APPBLIPS_DEBUG_CLIENT_IP) console.log(`[free-limits] x-forwarded-for="${req.headers['x-forwarded-for'] || ''}" peer=${req.socket.remoteAddress} -> ${ip}`);
      const visitor = visitorKey(ip);
      const response = await withKeys('provider', incoming, async (keys) => handleChatProxy(await withSavedProvider(incoming, keys), process.env, { freeLimits, visitor }));
      sendWebResponse(res, response, SECURITY_HEADERS, '[server]');
    };
    handle().catch(fail);
    return;
  }

  if (req.url === '/api/provider' || req.url.startsWith('/api/provider/')) {
    toFetchRequest(req, res)
      .then((request) => withKeys('provider', request, (keys) => handleProviderApi(request, process.env, keys)))
      .then((response) => sendWebResponse(res, response, SECURITY_HEADERS, '[server]'))
      .catch(fail);
    return;
  }

  if (req.url === '/api/surge' || req.url.startsWith('/api/surge/')) {
    toFetchRequest(req, res)
      .then((request) => withKeys('surge', request, (keys) => handleSurgeApi(request, process.env, keys)))
      .then((response) => sendWebResponse(res, response, SECURITY_HEADERS, '[server]'))
      .catch(fail);
    return;
  }

  if (req.url === '/api/pollinations' || req.url.startsWith('/api/pollinations/')) {
    toFetchRequest(req, res)
      .then((request) => withKeys('pollinations', request, (keys) => handlePollinationsApi(request, process.env, keys)))
      .then((response) => sendWebResponse(res, response, SECURITY_HEADERS, '[server]'))
      .catch(fail);
    return;
  }

  if (req.url === '/api/pixabay' || req.url.startsWith('/api/pixabay/')) {
    toFetchRequest(req, res)
      .then((request) => withKeys('pixabay', request, (keys) => handlePixabayApi(request, process.env, keys)))
      .then((response) => sendWebResponse(res, response, SECURITY_HEADERS, '[server]'))
      .catch(fail);
    return;
  }

  if (req.url === '/api/tavily' || req.url.startsWith('/api/tavily/')) {
    toFetchRequest(req, res)
      .then((request) => withKeys('tavily', request, (keys) => handleTavilyApi(request, process.env, keys)))
      .then((response) => sendWebResponse(res, response, SECURITY_HEADERS, '[server]'))
      .catch(fail);
    return;
  }

  if (req.url === '/api/seo/scan') {
    toFetchRequest(req, res)
      .then((request) => handleSeoScanApi(request, process.env, { lookup: resolveAddresses }))
      .then((response) => sendWebResponse(res, response, SECURITY_HEADERS, '[server]'))
      .catch(fail);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed');
    return;
  }
  serveStatic(req, res).catch(fail);
});

if (!existsSync(INDEX_FILE)) {
  console.error('AppBlips isn\'t built yet: dist/index.html is missing. Run `npm start` (it builds first), or `npm run build` and then `node server.js`.');
  process.exit(1);
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop whatever is using it, or start AppBlips on another port with PORT=3001.`);
  } else {
    console.error('[server]', err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  // Inside Docker, HOST is 0.0.0.0 but the address to open is the published
  // one; localhost is right for the default compose file.
  const shown = HOST === '0.0.0.0' || HOST === '::' || HOST === '127.0.0.1' ? 'localhost' : HOST;
  // Not on a Hugging Face Space (it sets SPACE_ID): its logs can be shown to
  // others, and the provider and model are the host's business.
  if (!process.env.SPACE_ID) console.log(`\n${formatConfigSummary(describeConfig(process.env))}\n`);
  console.log(`AppBlips is running. Open http://${shown}:${process.env.APPBLIPS_PUBLIC_PORT || PORT} in your browser.`);
});
