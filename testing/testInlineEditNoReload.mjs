// End-to-end Playwright test verifying that clicking 'Done' in click-to-edit
// updates the project version & source seamlessly WITHOUT reloading/refreshing
// the preview iframe, and that subsequent edits, Undo, and Code/Preview swaps
// all stay in sync.
//
//   node testing/testInlineEditNoReload.mjs

import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Bakery</title>
  <style>
    body { margin: 0; font-family: sans-serif; padding: 32px; }
    .card { border: 1px solid #e2e8f0; padding: 16px; margin-top: 16px; }
  </style>
</head>
<body>
  <h1 id="hero">Fresh Bread</h1>
  <div class="card"><h3>Starter</h3><p>Daily bake</p></div>
  <div class="card"><h3>Starter</h3><p>Daily bake</p></div>
  <script>
    window.__instanceId = Math.random().toString(36).slice(2);
    window.__bootCount = (window.__bootCount || 0) + 1;
  </script>
</body>
</html>`;

const PROJECT_ROW = {
  id: 'proj-no-reload-test',
  name: 'Bakery Test',
  updatedAt: new Date().toISOString(),
  data: {
    studioMode: 'website',
    currentVersionIndex: 0,
    chatContextStartIndex: 0,
    currentChatSessionId: 'session-1',
    versions: [
      {
        id: 1,
        prompt: 'Build a bakery page',
        files: { 'index.html': SAMPLE_HTML },
        timestamp: '12:00:00 PM',
        editMode: 'full-generation',
        chatMode: 'build',
        sessionId: 'session-1',
      },
    ],
    images: [],
  },
};

const viteServer = await createServer({
  server: { port: 0, strictPort: false, host: '127.0.0.1' },
  logLevel: 'silent',
});
await viteServer.listen();
const address = viteServer.httpServer.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.addInitScript((row) => {
    if (window === window.top) {
      sessionStorage.setItem('orion-app-session-started', 'true');
      localStorage.setItem('orion-skip-splash', 'true');
      localStorage.setItem('appblips-web-provider', JSON.stringify({ enabled: false, onboardingComplete: true }));
      localStorage.setItem('orion-legal-agreement', JSON.stringify({ terms: '2099-01-01', privacy: '2099-01-01', agreedAt: new Date().toISOString() }));
      localStorage.setItem('orion-projects', JSON.stringify([row]));
      localStorage.setItem('orion-current-project-id', row.id);
    }
  }, PROJECT_ROW);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  const liveFrame = () => page.frameLocator('iframe[data-appblips-browser="true"]');
  await liveFrame().locator('#hero').waitFor({ timeout: 15000 });

  // Locate the underlying Playwright Frame object for the live preview iframe
  const getPreviewFrame = async () => {
    const handle = await page.locator('iframe[data-appblips-browser="true"]').elementHandle();
    return handle.contentFrame();
  };

  let frame = await getPreviewFrame();
  const initialInstanceId = await frame.evaluate(() => window.__instanceId);
  assert.ok(initialInstanceId, 'preview script booted');

  // Track iframe load events across the page
  await page.evaluate(() => {
    window.__iframeLoadCount = 0;
    document.addEventListener('load', (e) => {
      if (e.target && e.target.tagName === 'IFRAME') window.__iframeLoadCount += 1;
    }, true);
  });

  // 1. Click #hero directly (editing is active by default), type a new line and text, format color, and click Done
  await frame.locator('#hero').click();
  await page.getByRole('toolbar', { name: 'Format text', exact: true }).waitFor();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Every Day');
  await page.getByRole('button', { name: /Text color/i }).click();
  await page.getByRole('button', { name: 'Red', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  // Wait for toolbar to close and commit round-trip to finish
  await page.getByRole('toolbar', { name: 'Format text', exact: true }).waitFor({ state: 'detached' });
  await page.waitForTimeout(250);

  const versionText = () => page.getByRole('group', { name: 'Version history' }).locator('.preview-version-count');

  // Verify version bumped to v2/2 without ANY iframe reload
  await versionText().filter({ hasText: 'v2/2' }).waitFor();
  const loadsAfterEdit1 = await page.evaluate(() => window.__iframeLoadCount);
  assert.equal(loadsAfterEdit1, 0, 'iframe must NOT reload after clicking Done');
  frame = await getPreviewFrame();
  const instanceAfterEdit1 = await frame.evaluate(() => window.__instanceId);
  assert.equal(instanceAfterEdit1, initialInstanceId, 'same iframe JS context stayed alive after Done');

  const heroAfter1 = await frame.evaluate(() => {
    const h = document.querySelector('#hero');
    return {
      text: h.innerText,
      hasBr: Boolean(h.querySelector('br')),
      color: h.style.color,
      outline: h.style.outline,
      editable: h.hasAttribute('contenteditable'),
    };
  });
  assert.ok(heroAfter1.text.includes('Fresh Bread') && heroAfter1.text.includes('Every Day'), `hero text updated: ${JSON.stringify(heroAfter1)}`);
  assert.equal(heroAfter1.hasBr, true, 'Enter line break materialized as <br> so it stays visible without contenteditable');
  assert.ok(heroAfter1.color, 'text color persisted on element');
  assert.equal(heroAfter1.outline, '', 'selection outline cleared after Done');
  assert.equal(heroAfter1.editable, false, 'contenteditable cleared after Done');

  // 2. Second edit after <br> shifted source positions: edit the 2nd duplicate card's <h3>Starter</h3>
  const secondCardH3 = frame.locator('.card h3').nth(1);
  await secondCardH3.click();
  await page.getByRole('toolbar', { name: 'Format text', exact: true }).waitFor();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Croissants');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('toolbar', { name: 'Format text', exact: true }).waitFor({ state: 'detached' });
  await page.waitForTimeout(250);

  await versionText().filter({ hasText: 'v3/3' }).waitFor();
  const loadsAfterEdit2 = await page.evaluate(() => window.__iframeLoadCount);
  assert.equal(loadsAfterEdit2, 0, 'iframe must NOT reload on second Done edit');
  assert.equal(await frame.evaluate(() => window.__instanceId), initialInstanceId);
  assert.equal(await frame.locator('.card h3').nth(0).innerText(), 'Starter');
  assert.equal(await frame.locator('.card h3').nth(1).innerText(), 'Croissants');

  // 3. Undo should reload back to v2 (where 2nd card is Starter again and #hero still has Every Day)
  await page.getByRole('button', { name: 'Previous version', exact: true }).click();
  await versionText().filter({ hasText: 'v2/3' }).waitFor();
  await page.waitForFunction(() => window.__iframeLoadCount >= 1);
  frame = await getPreviewFrame();
  await frame.locator('#hero').waitFor();
  assert.equal(await frame.locator('.card h3').nth(1).innerText(), 'Starter');
  assert.ok((await frame.locator('#hero').innerText()).includes('Every Day'));

  // Undo again back to v1 (where renderedCode matches original SAMPLE_HTML)
  await page.getByRole('button', { name: 'Previous version', exact: true }).click();
  await versionText().filter({ hasText: 'v1/3' }).waitFor();
  await page.waitForTimeout(350);
  frame = await getPreviewFrame();
  assert.equal(await frame.locator('#hero').innerText(), 'Fresh Bread');

  // 4. Redo to v2, then switch Code -> Preview and verify modified HTML persists
  await page.getByRole('button', { name: 'Next version', exact: true }).click();
  await versionText().filter({ hasText: 'v2/3' }).waitFor();
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  frame = await getPreviewFrame();
  await frame.locator('#hero').waitFor();
  assert.ok((await frame.locator('#hero').innerText()).includes('Every Day'));

  assert.deepEqual(pageErrors, []);
  console.log('ok - click-to-edit Done commits seamlessly without reloading the preview iframe');
} finally {
  await browser.close();
  await viteServer.close();
}
