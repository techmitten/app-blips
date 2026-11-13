// Run: node --test testing/testRemoteImages.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findNewStockPhotos, findBrokenStockPhotos, brokenStockPhotosNote } from '../src/lib/remoteImages.js';
import { listSections, extractUserNotes } from '../src/lib/edits.js';

const A = 'https://images.unsplash.com/photo-1?auto=format&w=800';
const B = 'https://images.unsplash.com/photo-2?w=800';
const C = 'https://images.unsplash.com/photo-3';

test('only stock photos new in this build are found', () => {
  const before = { 'index.html': `<img src="${A}">` };
  const after = { 'index.html': `<img src="${A.replace(/&/g, '&amp;')}"><img src="${B}"><div style="background:url('${C}')"></div><img src="images/mine.jpg">` };
  assert.deepEqual(findNewStockPhotos(before, after), [B, C]);
  assert.deepEqual(findNewStockPhotos({}, {}), []);
});

test('photos that fail to load are reported in order', async () => {
  const load = async (url) => url !== B;
  assert.deepEqual(await findBrokenStockPhotos([A, B, C], { load }), [B]);
  assert.deepEqual(await findBrokenStockPhotos([B], { load }), [B]);
  assert.deepEqual(await findBrokenStockPhotos([], { load }), []);
});

test('a loader that throws counts as a broken photo', async () => {
  const load = async (url) => { if (url === A) throw new Error('boom'); return true; };
  assert.deepEqual(await findBrokenStockPhotos([A, B], { load }), [A]);
});

test('every photo failing is treated as a network problem, not reported', async () => {
  assert.deepEqual(await findBrokenStockPhotos([A, B, C], { load: async () => false }), []);
});

test('nothing is checked where images cannot be loaded', async () => {
  assert.deepEqual(await findBrokenStockPhotos([A, B]), []);
});

test('the note counts the photos and is empty when none failed', () => {
  assert.equal(brokenStockPhotosNote([]), '');
  assert.match(brokenStockPhotosNote([A]), /^Note: a photo /);
  assert.match(brokenStockPhotosNote([A, B]), /^Note: 2 photos /);
});

test('section landmarks are found in HTML, JavaScript and JSX form', () => {
  const code = [
    '<!-- @section: head -->',
    '<script type="text/jsx">',
    '// @section: state',
    'function App() {',
    '  return (<div>',
    '    {/* @section: list view */}',
    '    <ul />',
    '    {/* an ordinary comment */}',
    '  </div>);',
    '}',
  ].join('\n');
  assert.deepEqual(listSections(code).map((s) => [s.name, s.startLine]), [['head', 1], ['state', 3], ['list view', 6]]);
});

test('notes for the user are picked out of the model\'s text', () => {
  assert.equal(extractUserNotes('Building it now.'), '');
  assert.equal(extractUserNotes('**Note:** I left out\nthe guestbook.\n\nOther text\n\nNote: I left out the guestbook.'), 'Note: I left out the guestbook.');
  assert.equal(extractUserNotes('Note: one.\n\nNote: two.'), 'Note: one.\n\nNote: two.');
});
