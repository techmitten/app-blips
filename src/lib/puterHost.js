// The parent side of Puter in the preview (puterHelper.js has the frame side).
// The preview frame can't run Puter.js (opaque origin), so its stand-in
// `puter` posts each call here, and this runs it with real Puter.js loaded in
// AppBlips' own page, signed in with the builder's Puter account.
//
// The calls come from generated code, so they are untrusted:
//  - only the methods in HANDLERS run, with their arguments checked;
//  - every preview shares AppBlips' one Puter app, so each project gets its
//    own corner of it: key-value keys are prefixed with the project and files
//    live under a folder of the project's own. A page can't name a key or a
//    path outside it, so one project never sees another's data;
//  - sign-in is never started by the page: the first call asks the builder in
//    an AppBlips dialog, whose button opens Puter's popup (a click, so the
//    browser doesn't block it). A page can't sign the builder out.
// Nothing secret goes back to the frame: Puter's session token stays with
// Puter.js in this page. The page only gets the account's user name.
//
// Puter.js is a third-party script in AppBlips' page, so it is loaded only
// when the Puter extension is on and a preview (or its Settings page) uses it.
import { PUTER_SCRIPT_URL } from './puterHelper.js';

const KV_PREFIX = (project) => `appblips:${project}:`;
const FS_ROOT = (project) => `appblips-previews/${project}`;
const MAX_KEY = 1024;
const MAX_PATH = 1024;

export class PuterError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const FRIENDLY = {
  insufficient_funds: 'Your Puter account has used up its free allowance for now.',
  too_many_requests: 'Puter is busy. Try again in a moment.',
  popup_blocked: 'Your browser blocked Puter’s sign-in window. Allow pop-ups for AppBlips and try again.',
  auth_window_closed: 'The Puter sign-in window was closed before signing in.',
  unsupported_origin: 'Puter doesn’t work in this version of AppBlips yet. Your published site still works.',
  storage_limit_reached: 'Your Puter storage is full.',
  subject_does_not_exist: 'That file or folder doesn’t exist.',
  item_with_same_name_exists: 'A file or folder with that name already exists.',
  value_not_a_number: 'That value isn’t a number.',
};

// Puter rejects with { error: { code, message } }, { code, message },
// { error: 'code', msg } or an Error. One shape for the frame.
export const toPuterError = (err) => {
  if (err instanceof PuterError) return err;
  const inner = err?.error && typeof err.error === 'object' ? err.error : err;
  const code = String((typeof err?.error === 'string' ? err.error : inner?.code) || 'failed');
  const message = FRIENDLY[code] || inner?.message || err?.msg || (typeof err?.message === 'string' && err.message) || 'Puter couldn’t do that. Try again.';
  return new PuterError(code, String(message).slice(0, 500));
};

const invalid = (message) => new PuterError('invalid', message);

// A project id as a safe key and folder name.
const projectSlug = (projectId) => String(projectId || 'draft').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'draft';

const checkKey = (key) => {
  if (typeof key !== 'string' && typeof key !== 'number') throw invalid('A Puter key must be text.');
  const text = String(key);
  if (!text || text.length > MAX_KEY) throw invalid('A Puter key must be 1 to 1024 characters.');
  return text;
};

// A page's path made relative to the project's folder. '', '.' and './' are
// the folder itself. Absolute paths, ~ and .. are refused.
export const rootPath = (project, path, { allowRoot = true } = {}) => {
  if (typeof path !== 'string' || path.length > MAX_PATH) throw invalid('A Puter path must be text.');
  const parts = path.replace(/\\/g, '/').split('/').filter((part) => part && part !== '.');
  if (path.startsWith('/') || path.startsWith('~') || parts.includes('..')) {
    throw invalid('Use a path inside your app’s own folder, such as notes/today.txt.');
  }
  if (!parts.length && !allowRoot) throw invalid('Name a file or folder.');
  return [FS_ROOT(project), ...parts].join('/');
};

const relativePath = (project, path) => {
  const root = `${FS_ROOT(project)}/`;
  const text = String(path || '');
  const at = text.indexOf(root);
  return at >= 0 ? text.slice(at + root.length) : text.split('/').pop();
};

// An FSItem as plain data, with its path relative to the project's folder.
const fsItem = (project, item) => (item && typeof item === 'object' ? {
  name: item.name,
  path: relativePath(project, item.path),
  is_dir: Boolean(item.is_dir),
  size: item.size ?? null,
  created: item.created ?? null,
  modified: item.modified ?? null,
  type: item.type ?? null,
} : item);

// Plain data the frame can receive (class instances and functions can't
// cross postMessage). Blobs and binary pass through.
const plain = (value) => {
  if (value == null || typeof value !== 'object') return value;
  if (value instanceof Blob || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value;
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
};

const options = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {});

// The media element Puter returns, as something the frame can load: its
// address, or the bytes when the address is a blob: URL of this page.
const mediaSource = async (element) => {
  const src = typeof element === 'string' ? element : element?.src || '';
  if (src.startsWith('blob:')) return (await fetch(src)).blob();
  return src;
};

const unprefix = (prefix, key) => (typeof key === 'string' && key.startsWith(prefix) ? key.slice(prefix.length) : key);

// method -> (puter, args, context) => result
const HANDLERS = {
  'ai.chat': async (puter, args, { onChunk }) => {
    if (!args.length) throw invalid('puter.ai.chat needs a prompt.');
    const rest = args.map((arg, i) => (i > 0 && arg && typeof arg === 'object' && !Array.isArray(arg) ? options(arg) : arg));
    const last = rest[rest.length - 1];
    if (last && typeof last === 'object' && !Array.isArray(last) && last.stream === true) {
      const stream = await puter.ai.chat(...rest);
      for await (const part of stream) onChunk(plain(part));
      return true;
    }
    return plain(await puter.ai.chat(...rest));
  },
  'ai.txt2img': async (puter, [prompt, opts]) => {
    // Puter would save the image to a path of the page's choosing.
    const safe = typeof opts === 'object' ? options(opts) : opts;
    if (safe && typeof safe === 'object') delete safe.puter_output_path;
    return mediaSource(await puter.ai.txt2img(String(prompt ?? ''), safe));
  },
  'ai.txt2speech': async (puter, [text, ...rest]) => mediaSource(await puter.ai.txt2speech(String(text ?? ''), ...rest)),
  // A string argument could be a Puter path outside the project's folder;
  // only web addresses, data: URIs and files the page sends are allowed.
  'ai.img2txt': async (puter, [image, ...rest]) => {
    if (typeof image === 'string' && !/^(https?:|data:)/i.test(image)) throw invalid('puter.ai.img2txt takes an image URL, a data: URI, a File or a Blob.');
    return plain(await puter.ai.img2txt(image, ...rest));
  },

  'kv.set': async (puter, [key, value, extra], { project }) => {
    if (Array.isArray(key)) throw invalid('Set one key at a time in AppBlips’ preview.');
    return plain(await puter.kv.set(KV_PREFIX(project) + checkKey(key), value, extra));
  },
  'kv.get': async (puter, [key], { project }) => {
    if (Array.isArray(key)) return plain(await puter.kv.get(key.map((k) => KV_PREFIX(project) + checkKey(k))));
    return plain(await puter.kv.get(KV_PREFIX(project) + checkKey(key)));
  },
  'kv.del': async (puter, [key], { project }) => plain(await puter.kv.del(KV_PREFIX(project) + checkKey(key))),
  'kv.incr': async (puter, [key, amount], { project }) => plain(await puter.kv.incr(KV_PREFIX(project) + checkKey(key), amount ?? 1)),
  'kv.decr': async (puter, [key, amount], { project }) => plain(await puter.kv.decr(KV_PREFIX(project) + checkKey(key), amount ?? 1)),
  // list(), list('prefix*'), list(pattern, returnValues) or list({ pattern, ... }).
  'kv.list': async (puter, [first, second], { project }) => {
    const prefix = KV_PREFIX(project);
    let result;
    if (first && typeof first === 'object') {
      const opts = options(first);
      opts.pattern = prefix + (typeof opts.pattern === 'string' ? opts.pattern : '*');
      result = await puter.kv.list(opts);
    } else {
      const pattern = typeof first === 'string' ? first : '*';
      result = await puter.kv.list(prefix + pattern, typeof first === 'boolean' ? first : Boolean(second));
    }
    const strip = (items) => items.map((item) => (typeof item === 'string' ? unprefix(prefix, item) : item && typeof item === 'object' ? { ...plain(item), key: unprefix(prefix, item.key) } : item));
    if (Array.isArray(result)) return strip(result);
    if (result && Array.isArray(result.items)) return { ...plain(result), items: strip(result.items) };
    return plain(result);
  },

  // Missing folders are always made: the project's own folder doesn't exist
  // until its first file.
  'fs.write': async (puter, [path, data, opts], { project }) => fsItem(project, await puter.fs.write(rootPath(project, path, { allowRoot: false }), data ?? '', { ...options(opts), createMissingParents: true })),
  'fs.read': async (puter, [path, opts], { project }) => puter.fs.read(rootPath(project, path, { allowRoot: false }), options(opts)),
  'fs.mkdir': async (puter, [path, opts], { project }) => fsItem(project, await puter.fs.mkdir(rootPath(project, path, { allowRoot: false }), { ...options(opts), createMissingParents: true })),
  'fs.readdir': async (puter, [path, opts], { project }) => {
    const full = rootPath(project, typeof path === 'string' ? path : '');
    let result;
    try {
      result = await puter.fs.readdir(full, options(opts));
    } catch (err) {
      // A project that hasn't saved a file yet has no folder: it is empty.
      if (full === FS_ROOT(project) && toPuterError(err).code === 'subject_does_not_exist') return [];
      throw err;
    }
    if (Array.isArray(result)) return result.map((item) => fsItem(project, item));
    if (result && Array.isArray(result.items)) return { ...plain(result), items: result.items.map((item) => fsItem(project, item)) };
    return plain(result);
  },
  'fs.delete': async (puter, [paths, opts], { project }) => {
    const list = (Array.isArray(paths) ? paths : [paths]).map((path) => rootPath(project, path, { allowRoot: false }));
    if (!list.length) throw invalid('Name a file or folder to delete.');
    await puter.fs.delete(list, options(opts));
    return true;
  },
  'fs.getReadURL': async (puter, [path, expiresIn], { project }) => plain(await puter.fs.getReadURL(rootPath(project, path, { allowRoot: false }), expiresIn)),

  'auth.signIn': async (puter) => ({ success: true, username: (await puter.auth.getUser())?.username || '' }),
  'auth.getUser': async (puter) => {
    const user = await puter.auth.getUser();
    return { username: user?.username || '', uuid: user?.uuid || '', is_temp: Boolean(user?.is_temp) };
  },
};

export const PUTER_METHODS = Object.keys(HANDLERS);

// A browser loader for Puter.js: one <script>, reused.
const browserLoader = () => {
  let loading = null;
  return () => {
    if (typeof window === 'undefined') return Promise.reject(new PuterError('unavailable', 'Puter isn’t available here.'));
    if (window.puter?.auth) return Promise.resolve(window.puter);
    loading ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PUTER_SCRIPT_URL;
      script.async = true;
      script.onload = () => (window.puter?.auth ? resolve(window.puter) : reject(new PuterError('unavailable', 'Puter didn’t load. Try again.')));
      script.onerror = () => {
        loading = null;
        script.remove();
        reject(new PuterError('offline', 'Couldn’t reach Puter. Check your connection and try again.'));
      };
      document.head.appendChild(script);
    });
    return loading;
  };
};

// `loadPuter` resolves to the `puter` global (a fake in tests).
export const createPuterHost = ({ loadPuter = browserLoader() } = {}) => {
  let puter = null;
  let signInRequest = null; // { waiters: [{ resolve, reject }] } while the dialog is open
  const listeners = new Set();
  const notify = () => { for (const listener of listeners) listener(); };

  const load = async () => {
    puter ||= await loadPuter();
    return puter;
  };

  const isSignedIn = () => {
    try { return Boolean(puter?.auth?.isSignedIn()); } catch { return false; }
  };

  // Asks the builder (the dialog that listens with onSignInRequest) and
  // waits for their answer.
  const askSignIn = () => new Promise((resolve, reject) => {
    signInRequest ||= { waiters: [] };
    signInRequest.waiters.push({ resolve, reject });
    notify();
  });

  // Starts Puter's popup. Call it straight from a click.
  const signIn = async () => {
    const p = await load();
    if (isSignedIn()) return;
    try {
      const result = await p.auth.signIn();
      if (result && result.success === false) throw result;
    } catch (err) {
      throw toPuterError(err);
    } finally {
      notify();
    }
  };

  const signOut = async () => {
    if (!puter) return;
    await puter.auth.signOut();
    notify();
  };

  const getUser = async () => {
    const p = await load();
    if (!isSignedIn()) return null;
    const user = await p.auth.getUser();
    return { username: user?.username || '' };
  };

  // The dialog's answer: true signs in (call it from the button's click).
  const answerSignIn = async (accept) => {
    const request = signInRequest;
    signInRequest = null;
    notify();
    if (!request) return;
    if (!accept) {
      for (const w of request.waiters) w.reject(new PuterError('signin-cancelled', 'Sign in to Puter to use this feature.'));
      return;
    }
    try {
      await signIn();
      for (const w of request.waiters) w.resolve();
    } catch (err) {
      for (const w of request.waiters) w.reject(err);
    }
  };

  // Runs one call from a preview. Resolves to its result or rejects with a
  // PuterError. `onChunk` receives the parts of a streamed chat.
  const handleCall = async ({ projectId, method, args, onChunk = () => {} }) => {
    const handler = Object.prototype.hasOwnProperty.call(HANDLERS, method) ? HANDLERS[method] : null;
    if (!handler) throw new PuterError('unsupported', `puter.${String(method).slice(0, 40)} isn’t available in AppBlips’ preview.`);
    if (!Array.isArray(args) || args.length > 4) throw invalid('Too many arguments.');
    try {
      const p = await load();
      if (!isSignedIn()) await askSignIn();
      return await handler(p, args, { project: projectSlug(projectId), onChunk });
    } catch (err) {
      throw toPuterError(err);
    }
  };

  return {
    load,
    isSignedIn,
    signIn,
    signOut,
    getUser,
    answerSignIn,
    handleCall,
    hasSignInRequest: () => Boolean(signInRequest),
    // Called when the sign-in state or the dialog changes.
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

export const puterHost = createPuterHost();
