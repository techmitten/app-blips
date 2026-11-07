// injectPreviewBridge (src/previewBridge.js): the bridge's placeholders are
// filled in with saved storage values and the token intact, whatever the
// values hold. Run: node testing/testPreviewBridgeInject.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { injectPreviewBridge } from '../src/previewBridge.js';

const html = '<!DOCTYPE html><html><head><title>App</title></head><body><h1>Hi</h1></body></html>';

test('storage values with dollar patterns or placeholder names do not corrupt the bridge', () => {
  const storage = {
    price: "$$ and $' and $` and $&",
    sneaky: '__ORION_INITIAL_TOUCH_ENABLED__ __ORION_SOURCE_FP__',
  };
  const { srcDoc, token } = injectPreviewBridge(html, { initialStorage: storage, touchEnabled: true });
  assert.ok(token);
  const seed = JSON.stringify(storage).replace(/</g, '\\u003c');
  assert.ok(srcDoc.includes(seed), 'the storage seed is not written as given');
  assert.equal(srcDoc.split(seed).length, 2, 'the storage seed appears more than once');
  assert.ok(!srcDoc.includes('__ORION_TOKEN__') && !srcDoc.includes('__ORION_INITIAL_STORAGE__'), 'a placeholder was left unfilled');
  assert.ok(!srcDoc.includes('__ORION_PROJECT_MODE__') && !srcDoc.includes('__ORION_SOURCE_FP__ '), 'a later placeholder was left unfilled');
  assert.ok(srcDoc.includes(token));
});
