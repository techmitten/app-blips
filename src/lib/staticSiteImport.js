// Imports a plain HTML website (one .html file, or a .zip of HTML/CSS/JS and
// images) into the Website Studio's model: `files` is a map of flat page name
// -> full HTML document (pages.js), and pictures go to the project's My images
// gallery (galleryImages.js), referred to as images/<name>.
//
// So each page stays one self-contained document, local stylesheets and
// scripts are built into every page that uses them, sub-folder pages get
// flat names (blog/post.html -> blog-post.html) with links rewritten to
// match, and other small files (fonts, icons) become data: URLs. Well-known
// libraries (jQuery, Bootstrap, ...) load from a CDN instead of being copied
// into every page, which keeps a multi-page site under MAX_FILES_BYTES.
//
// Nothing from the upload runs here: HTML, CSS and JS are only read as text
// and rewritten with function replacers (a stored "$'" must never reach
// String.replace as a replacement string).
import { unzip } from 'fflate';
import { LANDING_PAGE, MAX_FILES_BYTES, MAX_PAGES, filesSize } from './pages.js';
import { MAX_GALLERY_BYTES, MAX_GALLERY_IMAGES, galleryName, galleryPath } from './galleryImages.js';
import { bytesToBase64 } from './siteImages.js';
import { sha256Hex } from './codebase/hash.js';
import { SKIP_DIRS, formatBytes, normalizeProjectPath } from './codebase/paths.js';

export const MAX_STATIC_ZIP_BYTES = 80 * 1024 * 1024;
export const MAX_HTML_FILE_BYTES = 20 * 1024 * 1024;
const MAX_STATIC_FILES = 1000;
// Fonts, icons and other non-image files referenced by a page are built in as
// data: URLs only up to this size each (they're copied into every page).
const MAX_INLINE_ASSET_BYTES = 60 * 1024;
// data: images in the HTML larger than this move to My images.
const MIN_EXTRACTED_DATA_IMAGE = 2 * 1024;

export class StaticImportError extends Error {}
const fail = (message) => { throw new StaticImportError(message); };

const IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
const ASSET_TYPES = {
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
  ico: 'image/x-icon', avif: 'image/avif', bmp: 'image/bmp', json: 'application/json', txt: 'text/plain',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm',
};
const extOf = (path) => (/\.([a-z0-9]{1,5})$/i.exec(path)?.[1] || '').toLowerCase();
const isHtmlPath = (path) => /\.html?$/i.test(path);
const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');

// --- Text ---

const latin1Head = (bytes) => String.fromCharCode(...bytes.subarray(0, 2048));

// Pages saved by older editors are often windows-1252: decode with the
// declared charset (stored text is a JS string; the meta is rewritten to
// utf-8 so exports, which write UTF-8, stay right).
function decodeText(bytes, path) {
  let label = 'utf-8';
  if (isHtmlPath(path)) {
    const m = /<meta\b[^>]*charset\s*=\s*["']?([\w-]+)/i.exec(latin1Head(bytes));
    if (m) label = m[1].toLowerCase();
  } else if (extOf(path) === 'css') {
    const m = /^@charset\s+["']([\w-]+)["']/i.exec(latin1Head(bytes));
    if (m) label = m[1].toLowerCase();
  }
  let decoder;
  try { decoder = new TextDecoder(label); } catch { decoder = new TextDecoder('utf-8'); }
  return decoder.decode(bytes).replace(/^\uFEFF/, '');
}

const utf8Meta = (html) => html
  .replace(/<meta\b[^>]*\bcharset\s*=\s*["']?[\w-]+["']?[^>]*>/gi, () => '<meta charset="utf-8">');

// --- Paths and references ---

const EXTERNAL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

// A reference in a file at `fromPath`, resolved against the site, as
// { path, hash } with path relative to the zip (no leading slash), or null
// for external URLs, anchors and paths that leave the zip.
function resolveRef(ref, fromPath, root) {
  const raw = String(ref || '').trim();
  if (!raw || EXTERNAL_RE.test(raw)) return null;
  const hashAt = raw.indexOf('#');
  const hash = hashAt >= 0 ? raw.slice(hashAt) : '';
  let path = (hashAt >= 0 ? raw.slice(0, hashAt) : raw).split('?')[0];
  try { path = decodeURIComponent(path); } catch { /* keep as written */ }
  const base = path.startsWith('/') ? root : dirOf(fromPath);
  const parts = [];
  for (const part of `${base}${path.replace(/^\/+/, '')}`.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { if (!parts.length) return null; parts.pop(); } else parts.push(part);
  }
  const trailing = path === '' || path.endsWith('/');
  return { path: parts.join('/') + (trailing && parts.length ? '/' : ''), hash };
}

// The page a link means: exact file, folder/index.html, or a pretty URL
// without extension.
function findPage(path, pages) {
  const candidates = path === '' || path.endsWith('/')
    ? [`${path}index.html`, `${path}index.htm`]
    : [path, `${path}.html`, `${path}.htm`, `${path}/index.html`, `${path}/index.htm`];
  return candidates.find((candidate) => pages.has(candidate)) || null;
}

const slug = (text) => text.toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Flat Website Studio page name for a page at `path` under `root`:
// about.html -> about.html, About Us.htm -> about-us.html,
// blog/index.html -> blog.html, blog/post-1.html -> blog-post-1.html.
export function pageNameFor(path, root, taken) {
  let rel = path.slice(root.length).replace(/\.html?$/i, '');
  rel = rel.replace(/(^|\/)index$/i, '');
  const stem = (slug(rel.replace(/\//g, '-')) || 'page').slice(0, 34).replace(/-+$/, '') || 'page';
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${stem}.html` : `${stem}-${n}.html`;
    if (!taken.has(name)) return name;
  }
}

// --- Well-known libraries: load from a CDN instead of copying ---

const LIBRARIES = [
  { re: /\/\*!\s*jQuery v(\d+\.\d+\.\d+)/, js: (v) => `https://cdn.jsdelivr.net/npm/jquery@${v}/dist/jquery.min.js`, label: 'jQuery' },
  {
    re: /\*\s*Bootstrap\s+v(\d+\.\d+\.\d+)/, label: 'Bootstrap',
    css: (v) => `https://cdn.jsdelivr.net/npm/bootstrap@${v}/dist/css/bootstrap.min.css`,
    js: (v, path) => `https://cdn.jsdelivr.net/npm/bootstrap@${v}/dist/js/${/bundle/i.test(path) ? 'bootstrap.bundle.min.js' : 'bootstrap.min.js'}`,
  },
  {
    re: /Font Awesome Free (\d+\.\d+\.\d+)/, label: 'Font Awesome',
    css: (v, path) => {
      const file = path.split('/').pop().toLowerCase();
      return /^(all|fontawesome|brands|solid|regular|v4-shims|v5-font-face|v4-font-face)(\.min)?\.css$/.test(file)
        ? `https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@${v}/css/${file}` : null;
    },
  },
  {
    re: /Swiper (\d+\.\d+\.\d+)/, label: 'Swiper',
    css: (v) => `https://cdn.jsdelivr.net/npm/swiper@${v}/swiper-bundle.min.css`,
    js: (v) => `https://cdn.jsdelivr.net/npm/swiper@${v}/swiper-bundle.min.js`,
  },
  { re: /animate\.css[\s\S]{0,80}?Version - (\d+\.\d+\.\d+)/, css: (v) => `https://cdn.jsdelivr.net/npm/animate.css@${v}/animate.min.css`, label: 'Animate.css' },
];

// -> { url, label } when `text` (a local .css/.js file) is a known library build.
export function libraryCdn(path, text) {
  const kind = extOf(path) === 'css' ? 'css' : 'js';
  const head = text.slice(0, 600);
  for (const lib of LIBRARIES) {
    const m = lib.re.exec(head);
    if (!m || !lib[kind]) continue;
    const url = lib[kind](m[1], path);
    if (url) return { url, label: `${lib.label} ${m[1]}` };
  }
  return null;
}

// --- The import ---

const escAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const attrOf = (attrs, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>"']+))`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
};
const hasAttr = (attrs, name) => new RegExp(`\\s${name}(?=[\\s=>/]|$)`, 'i').test(attrs);

const URL_ATTR_RE = /(\s(?:src|href|poster|action|data-src|data-bg|data-background|data-image)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;
const SRCSET_RE = /(\s(?:srcset|data-srcset)\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi;
const CSS_URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)/gi;
const DATA_IMAGE_RE = /data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=\s]+)/gi;

/**
 * entries: { [zip path]: Uint8Array }. Returns
 * { kind: 'website', files, images, blobs: Map<hash, bytes>, meta, skipped, warnings }.
 * `measure(bytes, type)` may return { width, height } for a gallery image.
 */
export async function importStaticSite(entries, { sourceName = '', single = false, measure = null } = {}) {
  const skipped = [];
  const warnings = [];
  const all = new Map();
  for (const [rawPath, bytes] of Object.entries(entries)) {
    const path = normalizeProjectPath(rawPath);
    if (!path || path.endsWith('/')) continue;
    const segments = path.split('/');
    if (segments.some((s) => SKIP_DIRS.has(s)) || /^\.|^(Thumbs\.db|desktop\.ini)$/i.test(segments.at(-1))) continue;
    all.set(path, bytes);
  }
  const htmlPaths = [...all.keys()].filter(isHtmlPath);
  if (!htmlPaths.length) fail(single ? 'This file has no HTML in it.' : 'This zip has no .html pages in it.');

  // The site's root is the folder of its shallowest index.html (a zip made by
  // compressing a folder puts everything one level down).
  const depth = (p) => p.split('/').length;
  const indexes = htmlPaths.filter((p) => /(^|\/)index\.html?$/i.test(p)).sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  let landing = indexes[0];
  if (!landing) {
    if (htmlPaths.length > 1) fail('This zip has several .html pages but no index.html, so AppBlips can\'t tell which one is the home page. Name the home page index.html and try again.');
    landing = htmlPaths[0];
  }
  const root = dirOf(landing);
  const pagePaths = new Set(htmlPaths.filter((p) => p.startsWith(root)));
  for (const p of htmlPaths) if (!pagePaths.has(p)) skipped.push({ path: p, reason: 'outside the site folder' });

  const text = new Map();
  const readText = (path) => {
    if (!text.has(path)) text.set(path, all.has(path) ? decodeText(all.get(path), path) : null);
    return text.get(path);
  };

  // Pages: everything linked from the home page, plus top-level pages
  // (404.html, thank-you pages reached from scripts). Other HTML in the zip,
  // like a theme's demo or docs folder, is left out.
  const linkedFrom = (path) => {
    const out = [];
    const html = readText(path) || '';
    for (const m of html.matchAll(URL_ATTR_RE)) {
      const ref = resolveRef(m[2] ?? m[3] ?? m[4], path, root);
      const page = ref && findPage(ref.path, pagePaths);
      if (page) out.push(page);
    }
    return out;
  };
  const kept = new Set([landing]);
  const queue = [landing];
  while (queue.length) for (const next of linkedFrom(queue.shift())) if (!kept.has(next)) { kept.add(next); queue.push(next); }
  for (const p of pagePaths) if (dirOf(p) === root) kept.add(p);
  for (const p of pagePaths) if (!kept.has(p)) skipped.push({ path: p, reason: 'not linked from the site\'s pages' });
  if (kept.size > MAX_PAGES) {
    fail(`This site has ${kept.size} pages. A Website Studio site can have at most ${MAX_PAGES}.`);
  }

  // Flat names: index first, then by folder depth so top-level names win.
  const pageName = new Map([[landing, LANDING_PAGE]]);
  const taken = new Set([LANDING_PAGE]);
  for (const p of [...kept].filter((p) => p !== landing).sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))) {
    const name = pageNameFor(p, root, taken);
    taken.add(name);
    pageName.set(p, name);
  }

  // Gallery images, created as pages refer to them.
  const images = [];
  const blobs = new Map();
  const imageByPath = new Map();
  const imageByHash = new Map();
  let galleryBytes = 0;
  const imageFull = new Set();
  const addImage = async (bytes, type, fileName, origin) => {
    const hash = await sha256Hex(bytes);
    if (imageByHash.has(hash)) return imageByHash.get(hash);
    if (images.length >= MAX_GALLERY_IMAGES || galleryBytes + bytes.length > MAX_GALLERY_BYTES) {
      imageFull.add(origin);
      return null;
    }
    let size = {};
    try { size = (await measure?.(bytes, type)) || {}; } catch { /* unknown size */ }
    const image = {
      hash, type, size: bytes.length, note: '',
      name: galleryName(fileName, type, images.map((i) => i.name)),
      width: Number.isFinite(size.width) ? size.width : 0,
      height: Number.isFinite(size.height) ? size.height : 0,
    };
    images.push(image);
    blobs.set(hash, bytes);
    imageByHash.set(hash, image);
    galleryBytes += bytes.length;
    return image;
  };
  const imageFor = async (path) => {
    if (imageByPath.has(path)) return imageByPath.get(path);
    const type = IMAGE_TYPES[extOf(path)];
    const image = type && all.has(path) ? await addImage(all.get(path), type, path.split('/').pop(), path) : null;
    imageByPath.set(path, image);
    return image;
  };

  const missing = new Set();
  const cdnUsed = new Set();
  const inlinedAssets = new Set();
  const droppedAssets = new Set();
  const moduleImports = new Set();
  let inlineAssets = true;

  // A local file reference -> its new value, or null to leave it alone.
  const rewriteTarget = async (value, fromPath, { pages = true } = {}) => {
    const ref = resolveRef(value, fromPath, root);
    if (!ref) return null;
    if (pages) {
      const page = findPage(ref.path, pagePaths);
      if (page) return pageName.has(page) ? `${pageName.get(page)}${ref.hash}` : null;
    }
    if (!all.has(ref.path)) {
      if (ref.path && !ref.path.endsWith('/') && /\.[a-z0-9]{2,5}$/i.test(ref.path)) missing.add(ref.path);
      return null;
    }
    const image = await imageFor(ref.path);
    if (image) return galleryPath(image);
    const type = ASSET_TYPES[extOf(ref.path)];
    if (!type) {
      if (!/\.(?:css|js|mjs|html?)$/i.test(ref.path)) droppedAssets.add(ref.path);
      return null;
    }
    const bytes = all.get(ref.path);
    if (!inlineAssets || bytes.length > MAX_INLINE_ASSET_BYTES) { droppedAssets.add(ref.path); return null; }
    inlinedAssets.add(ref.path);
    return `data:${type};base64,${bytesToBase64(bytes)}${ref.hash}`;
  };

  const replaceAsync = async (input, re, fn) => {
    const parts = [];
    let last = 0;
    for (const m of input.matchAll(re)) {
      parts.push(input.slice(last, m.index), await fn(...m));
      last = m.index + m[0].length;
    }
    parts.push(input.slice(last));
    return parts.join('');
  };

  // Big data: images become gallery images (they'd otherwise be copied into
  // every version of every page).
  const extractDataImages = (input) => replaceAsync(input, DATA_IMAGE_RE, async (match, sub, b64) => {
    const clean = b64.replace(/\s+/g, '');
    if (clean.length * 0.75 < MIN_EXTRACTED_DATA_IMAGE) return match;
    let bytes;
    try { bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0)); } catch { return match; }
    const ext = sub === 'svg+xml' ? 'svg' : sub === 'jpeg' ? 'jpg' : sub;
    const image = await addImage(bytes, IMAGE_TYPES[ext], `embedded-image.${ext}`, 'embedded images');
    return image ? galleryPath(image) : match;
  });

  const rewriteCss = async (css, fromPath, seen = new Set()) => {
    // Local @import is built in where it stands (only the rule's position
    // matters, so it's simplest to inline it in place).
    let out = await replaceAsync(css, /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?([^;]*);/gi, async (match, href, media) => {
      const ref = resolveRef(href, fromPath, root);
      if (!ref || !ref.path.endsWith('.css')) return match;
      const sheet = readText(ref.path);
      if (sheet == null) { missing.add(ref.path); return match; }
      const cdn = libraryCdn(ref.path, sheet);
      if (cdn) { cdnUsed.add(cdn.label); return `@import url("${cdn.url}")${media};`; }
      if (seen.has(ref.path)) return '';
      const body = await rewriteCss(sheet, ref.path, new Set([...seen, ref.path]));
      return media.trim() ? `@media ${media.trim()} {\n${body}\n}` : body;
    });
    out = await replaceAsync(out, CSS_URL_RE, async (match, dq, sq, bare) => {
      const value = dq ?? sq ?? bare;
      const next = await rewriteTarget(value, fromPath, { pages: false });
      // Unquoted: it may sit inside a style="..." attribute, and gallery
      // paths and base64 data: URLs never hold spaces, quotes or brackets.
      return next ? `url(${next})` : match;
    });
    return out.replace(/^@charset[^;]*;/i, '');
  };

  // Quoted strings in scripts that name a local image (img.src = 'img/a.png')
  // resolve against the page, not the script file.
  const rewriteJsStrings = (js, pagePath) => replaceAsync(js, /(["'`])((?:\.{0,2}\/)?[\w@%+.\-/ ]+\.(?:jpe?g|png|webp|gif|svg))\1/gi, async (match, quote, value) => {
    const ref = resolveRef(value, pagePath, root);
    const image = ref && all.has(ref.path) ? await imageFor(ref.path) : null;
    return image ? `${quote}${galleryPath(image)}${quote}` : match;
  });

  const buildPage = async (pagePath) => {
    let html = utf8Meta(readText(pagePath));

    // The page's own markup and <style> blocks first; stylesheets built in
    // below are rewritten against their own folder, and must not be again.
    // (<link>/<script src> to local .css/.js files are left alone here.)
    // segments alternate: markup, <script>/<style> element, markup, ...
    const segments = [];
    let last = 0;
    for (const m of html.matchAll(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi)) {
      segments.push(html.slice(last, m.index), m[0]);
      last = m.index + m[0].length;
    }
    segments.push(html.slice(last));
    for (let i = 0; i < segments.length; i += 2) {
      let part = segments[i];
      part = await replaceAsync(part, URL_ATTR_RE, async (match, prefix, dq, sq, bare) => {
        const value = dq ?? sq ?? bare;
        // <link rel=stylesheet> to an external sheet, <a href=https://...>: kept.
        const next = await rewriteTarget(value, pagePath);
        return next == null ? match : `${prefix}"${escAttr(next)}"`;
      });
      part = await replaceAsync(part, SRCSET_RE, async (match, prefix, dq, sq) => {
        const list = await Promise.all((dq ?? sq).split(',').map(async (item) => {
          const [url, ...descriptor] = item.trim().split(/\s+/);
          const next = url ? await rewriteTarget(url, pagePath, { pages: false }) : null;
          return [next || url, ...descriptor].join(' ');
        }));
        return `${prefix}"${escAttr(list.join(', '))}"`;
      });
      part = await replaceAsync(part, /(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi, async (match, prefix, dq, sq) => {
        const quote = dq != null ? '"' : "'";
        return `${prefix}${quote}${await rewriteCss(dq ?? sq, pagePath)}${quote}`;
      });
      segments[i] = part;
    }
    // Inline <style> blocks written in the page itself.
    for (let i = 1; i < segments.length; i += 2) {
      if (/^<style/i.test(segments[i])) segments[i] = await rewriteCss(segments[i], pagePath);
    }
    html = segments.join('');

    // Stylesheets and scripts go in as they stand, with their own references
    // rewritten. Inline scripts can't defer, so deferred/async/module files
    // move to the end of <body>, keeping their order.
    const deferred = [];
    html = await replaceAsync(html, /<link\b([^>]*)>/gi, async (match, attrs) => {
      if (!/\brel\s*=\s*["']?stylesheet/i.test(attrs)) return match;
      const ref = resolveRef(attrOf(attrs, 'href'), pagePath, root);
      if (!ref) return match;
      const css = readText(ref.path);
      if (css == null) { missing.add(ref.path); return match; }
      const cdn = libraryCdn(ref.path, css);
      if (cdn) { cdnUsed.add(cdn.label); return `<link rel="stylesheet" href="${cdn.url}">`; }
      const media = attrOf(attrs, 'media');
      const body = (await rewriteCss(css, ref.path, new Set([ref.path]))).replace(/<\/style/gi, '<\\/style');
      return `<style${media ? ` media="${escAttr(media)}"` : ''}>\n${body}\n</style>`;
    });
    html = await replaceAsync(html, /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, async (match, attrs, inline) => {
      const src = attrOf(attrs, 'src');
      if (!src) return inline.trim() ? `<script${attrs}>${await rewriteJsStrings(inline, pagePath)}</script>` : match;
      const ref = resolveRef(src, pagePath, root);
      if (!ref) return match;
      const js = readText(ref.path);
      if (js == null) { missing.add(ref.path); return match; }
      const cdn = libraryCdn(ref.path, js);
      if (cdn) { cdnUsed.add(cdn.label); return match.replace(src, () => cdn.url); }
      const type = attrOf(attrs, 'type');
      const isModule = /^module$/i.test(type || '');
      if (isModule && /(?:^|[;\n])\s*(?:import|export)\b[^'"]*from\s*["']\.{0,2}\//.test(js)) moduleImports.add(ref.path);
      const keep = type ? ` type="${escAttr(type)}"` : '';
      const tag = `<script${keep}>\n${(await rewriteJsStrings(js, pagePath)).replace(/<\/script/gi, '<\\/script')}\n</script>`;
      if (hasAttr(attrs, 'defer') || hasAttr(attrs, 'async') || isModule) {
        deferred.push(tag);
        return '';
      }
      return tag;
    });

    html = await extractDataImages(html);
    if (deferred.length) {
      const scripts = `${deferred.join('\n')}\n`;
      html = /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>(?![\s\S]*<\/body)/i, (m) => `${scripts}${m}`) : `${html}\n${scripts}`;
    }
    if (!/<html[\s>]/i.test(html)) {
      html = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n${html}\n</body>\n</html>`;
    } else if (!/^\s*<!doctype/i.test(html)) {
      html = `<!DOCTYPE html>\n${html}`;
    }
    return html;
  };

  const buildAll = async () => {
    const files = {};
    for (const [path, name] of pageName) files[name] = await buildPage(path);
    return files;
  };
  let files = await buildAll();
  if (filesSize(files) > MAX_FILES_BYTES && inlinedAssets.size) {
    // Fonts and icons are copied into every page; drop them before giving up.
    inlineAssets = false;
    for (const path of inlinedAssets) droppedAssets.add(path);
    inlinedAssets.clear();
    files = await buildAll();
  }
  const size = filesSize(files);
  if (size > MAX_FILES_BYTES) {
    const pages = Object.keys(files).length;
    fail(`This site's pages come to ${formatBytes(size)} once each page's stylesheets and scripts are built in${pages > 1 ? ` (${pages} pages)` : ''}. A Website Studio site can be at most ${formatBytes(MAX_FILES_BYTES)}.`);
  }

  // What the user should know.
  if (cdnUsed.size) warnings.push(`These libraries now load from a CDN (jsDelivr) instead of a copy in your site: ${[...cdnUsed].join(', ')}.`);
  if (droppedAssets.size) {
    const list = [...droppedAssets].slice(0, 4).join(', ') + (droppedAssets.size > 4 ? ', …' : '');
    warnings.push(`${droppedAssets.size === 1 ? 'One file' : `${droppedAssets.size} files`} the pages use couldn't come along, because ${droppedAssets.size === 1 ? 'it is' : 'they are'} too large or of a type a page can't hold (${list}). Fonts fall back to the next font listed, and links to the rest won't open.`);
  }
  if (imageFull.size) warnings.push(`My images holds at most ${MAX_GALLERY_IMAGES} images (${formatBytes(MAX_GALLERY_BYTES)}), so some pictures were left out and show as broken images: ${[...imageFull].slice(0, 4).join(', ')}${imageFull.size > 4 ? ', …' : ''}.`);
  if (missing.size) {
    const list = [...missing].slice(0, 4).join(', ') + (missing.size > 4 ? ', …' : '');
    warnings.push(single
      ? `This page refers to ${missing.size} file${missing.size === 1 ? '' : 's'} that ${missing.size === 1 ? 'isn\'t' : 'aren\'t'} included (${list}). To bring ${missing.size === 1 ? 'it' : 'them'} too, import a .zip of the whole site folder instead.`
      : `Some files the pages refer to aren't in the zip: ${list}.`);
  }
  if (moduleImports.size) warnings.push(`Some scripts import other script files (${[...moduleImports].slice(0, 3).join(', ')}). Those imports may not work in the preview.`);
  const unused = [...all.keys()].filter((p) => IMAGE_TYPES[extOf(p)] && !imageByPath.has(p));
  for (const p of unused.slice(0, 200)) skipped.push({ path: p, reason: 'not used by any page' });

  return {
    kind: 'website',
    files,
    images,
    blobs,
    meta: {
      sourceName: String(sourceName).slice(0, 200),
      pageCount: Object.keys(files).length,
    },
    skipped,
    warnings,
  };
}

// --- Entry points ---

export async function importHtmlFile(bytes, options = {}) {
  if (bytes.length > MAX_HTML_FILE_BYTES) fail(`This file is larger than ${formatBytes(MAX_HTML_FILE_BYTES)}.`);
  const name = String(options.sourceName || 'index.html').split(/[\\/]/).pop();
  // Whatever it's called, a single file is the home page.
  return importStaticSite({ [/^index\.html?$/i.test(name) ? name : 'index.html']: bytes }, { ...options, single: true });
}

function unzipAsync(bytes, filter) {
  return new Promise((resolve, reject) => {
    unzip(bytes, { filter }, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

export async function importStaticZip(bytes, options = {}) {
  let declared = 0;
  let count = 0;
  let raw;
  try {
    raw = await unzipAsync(bytes, (info) => {
      const name = normalizeProjectPath(info.name);
      if (!name || name.endsWith('/') || name.split('/').some((s) => SKIP_DIRS.has(s))) return false;
      count += 1;
      declared += info.originalSize;
      if (count > MAX_STATIC_FILES) fail(`This zip has more than ${MAX_STATIC_FILES} files.`);
      if (declared > MAX_STATIC_ZIP_BYTES) fail(`This zip unpacks to more than ${formatBytes(MAX_STATIC_ZIP_BYTES)}.`);
      return true;
    });
  } catch (err) {
    if (err instanceof StaticImportError) throw err;
    fail('This file could not be opened as a .zip archive.');
  }
  // A zip bomb can lie about sizes.
  const real = Object.values(raw).reduce((n, b) => n + b.length, 0);
  if (real > MAX_STATIC_ZIP_BYTES) fail(`This zip unpacks to more than ${formatBytes(MAX_STATIC_ZIP_BYTES)}.`);
  return importStaticSite(raw, options);
}

// Which importer a .zip needs: 'codebase' when it holds a React + Vite
// project (a package.json listing vite and react next to the shallowest
// one), 'static' when it holds HTML pages, else 'codebase' (whose import
// explains what's wrong).
export async function detectZipKind(bytes) {
  const names = [];
  let raw;
  try {
    raw = await unzipAsync(bytes, (info) => {
      const name = normalizeProjectPath(info.name);
      if (!name || name.split('/').some((s) => SKIP_DIRS.has(s))) return false;
      names.push(name);
      return /(^|\/)package\.json$/.test(name) && name.split('/').length <= 2 && info.originalSize < 512 * 1024;
    });
  } catch {
    return 'codebase';
  }
  for (const bytesOfPkg of Object.values(raw)) {
    try {
      const pkg = JSON.parse(new TextDecoder().decode(bytesOfPkg));
      const deps = { ...(pkg.devDependencies || {}), ...(pkg.dependencies || {}) };
      if (deps.vite || deps.react || deps.next) return 'codebase';
    } catch { /* not JSON: not a project manifest we can use */ }
  }
  return names.some(isHtmlPath) ? 'static' : 'codebase';
}
