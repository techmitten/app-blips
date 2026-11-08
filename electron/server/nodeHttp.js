// Glue between Node's http (req, res) and the Fetch-style handlers in this
// folder. Used by the Vite dev middleware (vite.config.js) and the browser
// server (server.js); the desktop app doesn't need it, since protocol.handle
// already speaks Request/Response.
import { Readable, pipeline } from 'node:stream';

// Bodies are buffered before any handler runs, so a cap stops one request
// from taking all the memory. Chat carries a whole project's files and the
// conversation; Publish carries a site's images (siteImages.js, 60 MB).
export const MAX_CHAT_BODY_BYTES = 32 * 1024 * 1024;
export const MAX_BODY_BYTES = 72 * 1024 * 1024;

export class BodyTooLargeError extends Error {
  constructor(limit) {
    super(`The request body is larger than ${Math.round(limit / 1024 / 1024)} MB.`);
    this.name = 'BodyTooLargeError';
    this.status = 413;
  }
}

async function readBody(req, limit) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) throw new BodyTooLargeError(limit);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      req.destroy();
      throw new BodyTooLargeError(limit);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// A signal that fires when the client goes away before the response is
// complete, so a handler's upstream call (the LLM, a scanned site) is
// cancelled with it instead of running to the end for nobody. Needs `res`:
// its 'close' comes once per response, finished or not (the request's own
// 'close' only means the body was read, and the socket outlives a request
// under keep-alive).
const clientSignal = (res) => {
  const controller = new AbortController();
  res?.once('close', () => {
    if (!res.writableFinished) controller.abort(new DOMException('The client went away.', 'AbortError'));
  });
  return controller.signal;
};

// A Fetch Request for /api/chat from a Node request. Only the body,
// content type and Origin go through. The real Host and Origin are kept so the
// handler refuses browser requests from other sites (isForeignOrigin in
// chatProxy.js).
export async function toChatRequest(req, res = null) {
  const body = await readBody(req, MAX_CHAT_BODY_BYTES);
  const protocol = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return new Request(protocol + '://' + (req.headers.host || 'localhost') + '/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(req.headers.origin ? { origin: req.headers.origin } : {}),
      ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
    },
    body,
    signal: clientSignal(res),
  });
}

// The same for /api/provider/*, keeping the method and path. Under Vite's
// connect, req.url has the mount prefix stripped; originalUrl doesn't.
export async function toFetchRequest(req, res = null) {
  const protocol = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const body = hasBody ? await readBody(req, MAX_BODY_BYTES) : undefined;
  return new Request(protocol + '://' + (req.headers.host || 'localhost') + (req.originalUrl || req.url), {
    method: req.method,
    headers: {
      ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}),
      ...(req.headers.origin ? { origin: req.headers.origin } : {}),
    },
    ...(hasBody ? { body } : {}),
    signal: clientSignal(res),
  });
}

// Vite's connect server and a bare http server both treat an 'error' event on
// an unhandled stream as an uncaught exception, which on modern Node kills the
// whole process. This costs one request instead: pipeline() forwards errors
// from either side and, when the client goes away (the user cancelling a
// generation mid-stream), destroys the upstream body so the LLM request is
// cancelled too.
export function sendWebResponse(res, response, extraHeaders = {}, logPrefix = '[proxy]') {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  if (!response.body) {
    res.end();
    return;
  }
  pipeline(Readable.fromWeb(response.body), res, (err) => {
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      console.error(`${logPrefix} stream error:`, err);
    }
  });
}
