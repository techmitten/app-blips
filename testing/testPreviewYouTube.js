// Run: node testing/testPreviewYouTube.js
// The preview shows YouTube embeds as a poster (the player can't run in the
// sandbox) and the app opens the video on YouTube. The id comes from the
// generated page, so only a YouTube-alphabet id may reach the fixed URL.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { injectPreviewBridge, youTubeWatchUrl, PREVIEW_BRIDGE_SCRIPT } from '../src/previewBridge.js';

assert.equal(youTubeWatchUrl({ kind: 'video', id: 'dQw4w9WgXcQ' }), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
assert.equal(youTubeWatchUrl({ kind: 'list', id: 'PL1234abcd_-' }), 'https://www.youtube.com/playlist?list=PL1234abcd_-');
for (const bad of [
  null, undefined, {}, { kind: 'video' }, { kind: 'video', id: 'short' },
  { kind: 'video', id: 'dQw4w9WgXc&' }, { kind: 'video', id: 'dQw4w9WgXcQ/../x' },
  { kind: 'list', id: 'a b' }, { kind: 'list', id: 'x'.repeat(65) },
  { kind: 'channel', id: 'dQw4w9WgXcQ' }, { kind: 'video', id: ['dQw4w9WgXcQ'] },
]) {
  assert.equal(youTubeWatchUrl(bad), null, `rejects ${JSON.stringify(bad)}`);
}

// The poster code is part of the injected bridge, never of the stored page.
const page = '<!doctype html><html><head></head><body><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe></body></html>';
const injected = injectPreviewBridge(page).srcDoc;
assert.ok(injected.includes('swapYouTubeFrame'), 'bridge carries the YouTube poster');
assert.ok(injected.includes('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>'), 'the embed itself is left as written');

// The in-frame recognizer, lifted out of the bridge source and run as is.
const start = PREVIEW_BRIDGE_SCRIPT.indexOf('  var YT_HOSTS =');
const end = PREVIEW_BRIDGE_SCRIPT.indexOf('  function youTubePoster');
assert.ok(start > 0 && end > start, 'found youTubeTarget in the bridge');
const sandbox = { URL, document: { baseURI: 'about:srcdoc' } };
vm.runInNewContext(PREVIEW_BRIDGE_SCRIPT.slice(start, end) + '\nthis.youTubeTarget = youTubeTarget;', sandbox);
const target = (url) => JSON.stringify(sandbox.youTubeTarget(url));
const video = JSON.stringify({ kind: 'video', id: 'dQw4w9WgXcQ' });
for (const url of [
  'https://www.youtube.com/embed/dQw4w9WgXcQ',
  'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&playsinline=1',
  'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
  'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ?si=abc',
  'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  'https://www.youtube.com/live/dQw4w9WgXcQ',
  'http://www.youtube.com/v/dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123',
]) assert.equal(target(url), video, url);
const list = JSON.stringify({ kind: 'list', id: 'PLabc123' });
assert.equal(target('https://www.youtube.com/playlist?list=PLabc123'), list);
assert.equal(target('https://www.youtube.com/embed/videoseries?list=PLabc123'), list);
for (const url of [
  'https://www.youtube.com/', 'https://www.youtube.com/@channel', 'https://www.youtube.com/results?search_query=x',
  'https://evil.example/embed/dQw4w9WgXcQ', 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
  'javascript:alert(1)', 'https://www.youtube.com/watch?v=bad', 'page.html',
]) assert.equal(sandbox.youTubeTarget(url), null, url);

console.log('testPreviewYouTube: ok');
