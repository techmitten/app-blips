// The default AppBlips icon only goes on pages that have no icon of their own.
// Run: node --test testing/testDefaultFavicon.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { withFavicon } from '../src/lib/favicon.js';

const own = '<html><head><link rel="icon" href="data:,x"></head><body></body></html>';
const none = '<html><head><title>t</title></head><body></body></html>';

test('keepOwn leaves a page that already has an icon alone', () => {
  const out = withFavicon({ 'a.html': own, 'b.html': none }, { keepOwn: true });
  assert.equal(out['a.html'], own);
  assert.match(out['b.html'], /href="\/favicon\.png"/);
});

test('without keepOwn the chosen icon replaces the page icon', () => {
  const out = withFavicon({ 'a.html': own });
  assert.match(out['a.html'], /href="\/favicon\.png"/);
  assert.doesNotMatch(out['a.html'], /data:,x/);
});
