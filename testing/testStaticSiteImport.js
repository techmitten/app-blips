// Run: node --test testing/testStaticSiteImport.js
// Importing a plain HTML site (one .html file or a .zip of HTML/CSS/JS and
// images) into the Website Studio model (src/lib/staticSiteImport.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zipSync } from 'fflate';
import {
  importHtmlFile, importStaticZip, importStaticSite, detectZipKind, pageNameFor, libraryCdn, StaticImportError,
} from '../src/lib/staticSiteImport.js';
import { MAX_FILES_BYTES } from '../src/lib/pages.js';

const enc = (s) => new TextEncoder().encode(s);
// A tiny valid PNG header is enough: the import stores bytes, it doesn't decode them.
const png = (n = 1) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n, n, n]);
const zip = (entries) => zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, typeof v === 'string' ? enc(v) : v])));

const SITE = {
  'my-site/index.html': `<!doctype html><html><head><meta charset="windows-1252"><title>Home</title>
<link rel="stylesheet" href="css/style.css"><link rel="icon" href="favicon.ico">
<script src="js/vendor/jquery.min.js"></script>
<script defer src="js/app.js"></script></head>
<body><a href="about.html">About</a> <a href="blog/">Blog</a> <a href="/contact">Contact</a>
<a href="https://example.com/x.html">ext</a> <a href="#top">top</a>
<img src="img/hero.png" srcset="img/hero.png 1x, img/hero@2x.png 2x" alt="">
<div style="background: url('img/bg.png')"></div>
<script>document.title = "Hi"; var s = "</div>";</script></body></html>`,
  'my-site/about.html': '<html><body><a href="index.html">Home</a><a href="./blog/post-1.html#c">Post</a></body></html>',
  'my-site/contact.html': '<html><body><form action="thanks.html"></form></body></html>',
  'my-site/thanks.html': '<html><body>Thanks</body></html>',
  'my-site/blog/index.html': '<html><body><a href="post-1.html">Post</a><a href="../index.html">Home</a><img src="../img/hero.png"></body></html>',
  'my-site/blog/post-1.html': '<html><body><a href="../about.html">About</a></body></html>',
  'my-site/demo/unused.html': '<html><body>theme demo</body></html>',
  'my-site/css/style.css': '@import "base.css";\nbody { background: url(../img/bg.png); }\n@font-face { src: url("../fonts/a.woff2") format("woff2"); }',
  'my-site/css/base.css': 'h1 { color: red }',
  'my-site/js/app.js': 'const pic = "img/hero.png"; if (x) "</script>";',
  'my-site/js/vendor/jquery.min.js': '/*! jQuery v3.7.1 | (c) OpenJS Foundation */ !function(){}()',
  'my-site/img/hero.png': png(1),
  'my-site/img/hero@2x.png': png(2),
  'my-site/img/bg.png': png(3),
  'my-site/img/unused.png': png(4),
  'my-site/fonts/a.woff2': new Uint8Array([1, 2, 3]),
  'my-site/favicon.ico': new Uint8Array([0, 0, 1, 0]),
  'my-site/node_modules/x/index.html': '<html></html>',
  '__MACOSX/my-site/._index.html': 'junk',
};

test('a multi-page zip becomes flat Website Studio pages', async () => {
  const result = await importStaticZip(zip(SITE), { sourceName: 'my-site.zip' });
  assert.equal(result.kind, 'website');
  assert.deepEqual(Object.keys(result.files).sort(), ['about.html', 'blog-post-1.html', 'blog.html', 'contact.html', 'index.html', 'thanks.html']);
  const home = result.files['index.html'];
  // Links follow the flat names; external links and anchors stay.
  assert.match(home, /href="about\.html"/);
  assert.match(home, /href="blog\.html"/);
  assert.match(home, /href="contact\.html"/);
  assert.match(home, /href="https:\/\/example\.com\/x\.html"/);
  assert.match(home, /href="#top"/);
  assert.match(result.files['about.html'], /href="blog-post-1\.html#c"/);
  assert.match(result.files['blog.html'], /href="index\.html"/);
  assert.match(result.files['blog-post-1.html'], /href="about\.html"/);
  // CSS (with its @import) and JS are built in; jQuery comes from a CDN.
  assert.match(home, /<style>[\s\S]*h1 \{ color: red \}[\s\S]*<\/style>/);
  assert.match(home, /cdn\.jsdelivr\.net\/npm\/jquery@3\.7\.1\/dist\/jquery\.min\.js/);
  assert.ok(!/css\/style\.css|js\/app\.js/.test(home));
  // Deferred script moves to the end of body; "</script>" inside it is escaped.
  assert.match(home, /<\\\/script>";\n<\/script>\n<\/body>/);
  // Images go to My images; the CSS url() resolves from the stylesheet's folder.
  assert.deepEqual(result.images.map((i) => i.name).sort(), ['bg.png', 'hero.png', 'hero-2x.png'].sort());
  assert.match(home, /src="images\/hero\.png"/);
  assert.match(home, /srcset="images\/hero\.png 1x, images\/hero-2x\.png 2x"/);
  assert.match(home, /url\(images\/bg\.png\)/);
  assert.match(home, /background: url\(images\/bg\.png\)/);
  assert.match(home, /const pic = "images\/hero\.png"/);
  assert.match(result.files['blog.html'], /src="images\/hero\.png"/);
  assert.equal(result.blobs.size, 3);
  // Small fonts and icons become data: URLs.
  assert.match(home, /url\(data:font\/woff2;base64,AQID\)/);
  assert.match(home, /href="data:image\/x-icon;base64,/);
  // The charset is UTF-8 now, and the page has a doctype.
  assert.match(home, /^<!doctype html>/i);
  assert.match(home, /<meta charset="utf-8">/);
  // Junk and unlinked pages are left out.
  assert.ok(result.skipped.some((s) => s.path === 'my-site/demo/unused.html'));
  assert.ok(result.skipped.some((s) => s.path === 'my-site/img/unused.png'));
  assert.ok(result.warnings.some((w) => /jQuery 3\.7\.1/.test(w)));
  assert.ok(!result.warnings.some((w) => /aren't in the zip/.test(w)), result.warnings.join('\n'));
});

test('a single HTML file becomes index.html and reports missing files', async () => {
  const html = '<html><head><link rel="stylesheet" href="style.css"></head><body><h1>Hello</h1><img src="data:image/png;base64,' +
    Buffer.alloc(4000, 7).toString('base64') + '"></body></html>';
  const result = await importHtmlFile(enc(html), { sourceName: 'Landing Page.html' });
  assert.deepEqual(Object.keys(result.files), ['index.html']);
  assert.match(result.files['index.html'], /<h1>Hello<\/h1>/);
  // The large data: image moved to My images.
  assert.equal(result.images.length, 1);
  assert.match(result.files['index.html'], /src="images\/embedded-image\.png"/);
  assert.ok(result.warnings.some((w) => /style\.css/.test(w) && /\.zip/.test(w)));
});

test('a fragment gets a full document around it', async () => {
  const result = await importHtmlFile(enc('<h1>Hi</h1>'), { sourceName: 'x.htm' });
  assert.match(result.files['index.html'], /^<!DOCTYPE html>[\s\S]*<body>\n<h1>Hi<\/h1>/);
});

test('replacement text with $ patterns is kept literally', async () => {
  const result = await importStaticSite({
    'index.html': enc('<link rel="stylesheet" href="a.css"><script src="a.js"></script>'),
    'a.css': enc("body::after { content: \"$' $& $$\" }"),
    'a.js': enc("var s = \"$' $& $$\";"),
  });
  assert.ok(result.files['index.html'].includes("content: \"$' $& $$\""));
  assert.ok(result.files['index.html'].includes("var s = \"$' $& $$\";"));
});

test('errors: no pages, no index among several, too many pages, too large', async () => {
  await assert.rejects(importStaticZip(zip({ 'a.css': 'x' })), StaticImportError);
  await assert.rejects(importStaticZip(zip({ 'a.html': 'x', 'b.html': 'y' })), /index\.html/);
  const many = { 'index.html': '' };
  for (let i = 0; i < 14; i++) many[`p${i}.html`] = 'x';
  await assert.rejects(importStaticZip(zip(many)), /at most 12/);
  const big = { 'index.html': '<link rel="stylesheet" href="big.css">', 'big.css': `/* ${'x'.repeat(MAX_FILES_BYTES)} */` };
  await assert.rejects(importStaticZip(zip(big)), /at most/);
  await assert.rejects(importStaticZip(enc('not a zip')), /could not be opened/);
});

test('detectZipKind tells React + Vite projects from static sites', async () => {
  assert.equal(await detectZipKind(zip({ 'site/package.json': JSON.stringify({ devDependencies: { vite: '5' }, dependencies: { react: '18' } }), 'site/index.html': '' })), 'codebase');
  assert.equal(await detectZipKind(zip({ 'site/index.html': '', 'site/style.css': '' })), 'static');
  assert.equal(await detectZipKind(zip({ 'package.json': '{"devDependencies":{"sass":"1"}}', 'index.html': '' })), 'static');
  assert.equal(await detectZipKind(zip({ 'readme.md': '' })), 'codebase');
});

test('page names and library detection', () => {
  const taken = new Set(['index.html']);
  assert.equal(pageNameFor('About Us.htm', '', taken), 'about-us.html');
  assert.equal(pageNameFor('site/blog/index.html', 'site/', taken), 'blog.html');
  taken.add('blog.html');
  assert.equal(pageNameFor('site/Blog.html', 'site/', taken), 'blog-2.html');
  assert.equal(libraryCdn('css/bootstrap.min.css', '/*!\n * Bootstrap  v5.3.2 (https://getbootstrap.com/)')?.url, 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css');
  assert.equal(libraryCdn('js/bootstrap.bundle.min.js', '/*!\n  * Bootstrap v5.3.2 (https://getbootstrap.com/)')?.url, 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js');
  assert.equal(libraryCdn('css/site.css', 'body{}'), null);
});
