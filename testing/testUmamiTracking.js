// Run: node testing/testUmamiTracking.js
// Verifies that Umami tracking is present in index.html and runs only on the
// web version (not in the Electron desktop app or the Capacitor Android app).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.ok(html.includes('https://umami.techmitten.com/script.js'), 'contains Umami script URL');
assert.ok(html.includes('d5b8a23c-5f0b-41ee-a4b1-508e45512d23'), 'contains Umami website ID');

// Extract the tracking inline script from index.html
const segment = html.split('<script>').find((s) => s.includes('https://umami.techmitten.com/script.js'));
assert.ok(segment, 'found Umami script tag in index.html');
const scriptSource = segment.split('</script>')[0].trim();

function runWithMocks(win) {
  const appended = [];
  const doc = {
    head: {
      appendChild(node) {
        appended.push(node);
      },
    },
    createElement(tag) {
      const attrs = {};
      return {
        tagName: tag.toUpperCase(),
        defer: false,
        src: '',
        setAttribute(k, v) {
          attrs[k] = String(v);
        },
        getAttribute(k) {
          return attrs[k];
        },
      };
    },
  };

  const fn = new Function('window', 'document', scriptSource);
  fn(win, doc);
  return appended;
}

// 1. Web version: should inject Umami script with defer and data-website-id
{
  const win = {
    location: { protocol: 'https:' },
  };
  const appended = runWithMocks(win);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].defer, true);
  assert.equal(appended[0].src, 'https://umami.techmitten.com/script.js');
  assert.equal(appended[0].getAttribute('data-website-id'), 'd5b8a23c-5f0b-41ee-a4b1-508e45512d23');
}

// 2. Desktop app via window.appblipsDesktop: should not inject
{
  const win = {
    location: { protocol: 'https:' },
    appblipsDesktop: {},
  };
  const appended = runWithMocks(win);
  assert.equal(appended.length, 0);
}

// 3. Desktop app via appblips: protocol: should not inject
{
  const win = {
    location: { protocol: 'appblips:' },
  };
  const appended = runWithMocks(win);
  assert.equal(appended.length, 0);
}

// 4. Android app via window.androidBridge: should not inject
{
  const win = {
    location: { protocol: 'https:' },
    androidBridge: {},
  };
  const appended = runWithMocks(win);
  assert.equal(appended.length, 0);
}

// 5. Android app via window.Capacitor.getPlatform(): should not inject
{
  const win = {
    location: { protocol: 'https:' },
    Capacitor: { getPlatform: () => 'android' },
  };
  const appended = runWithMocks(win);
  assert.equal(appended.length, 0);
}

console.log('ok');
