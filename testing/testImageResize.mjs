// End-to-end Playwright test for click-to-edit image resizing:
// 1. Selecting an image shows resize handles; dragging a corner handle resizes
//    proportionally, updates the toolbar W/H inputs, saves a version, and does
//    NOT reload the preview iframe.
// 2. Typing W/H in ElementToolbar (with aspect-ratio lock & unlock) and
//    clicking Apply updates the image without reloading the iframe.
// 3. Undo restores the previous size.
//
//   node testing/testImageResize.mjs

import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

// Tiny 1x1 SVG data URI so no external network request is needed.
const SVG_DATA_URI = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#3b82f6"/></svg>',
);

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Gallery</title>
  <style>
    body { margin: 0; padding: 32px; font-family: sans-serif; }
    img { display: block; }
  </style>
</head>
<body>
  <h1>Our Studio</h1>
  <img id="photo" src="${SVG_DATA_URI}" alt="Blue banner" width="400" height="200">
  <div id="photo-card" style="width: 240px; height: 140px; overflow: hidden; border: 2px solid #0f172a;">
    <img id="card-photo" src="${SVG_DATA_URI}" alt="Card photo" width="200" height="100">
  </div>
  <div id="circle-card" style="width: 160px; height: 160px; border-radius: 50%; overflow: hidden;">
    <img id="circle-photo" src="${SVG_DATA_URI}" alt="Circle photo" style="width: 100%; height: 100%; object-fit: cover;">
  </div>
  <div id="pct-card" style="width: 200px; height: 200px; border-radius: 20%; overflow: hidden;">
    <img id="pct-photo" src="${SVG_DATA_URI}" alt="Pct photo" style="width: 100%; height: 100%; object-fit: cover;">
  </div>
  <div id="auto-h-card" style="width: 240px; height: 140px; border-radius: 24px; overflow: hidden;">
    <img id="auto-h-photo" src="${SVG_DATA_URI}" alt="Auto height photo" style="width: 100%; height: auto;">
  </div>
  <div id="aspect-card" style="width: 160px; aspect-ratio: 1 / 1; border-radius: 24px; overflow: hidden;">
    <img id="aspect-photo" src="${SVG_DATA_URI}" alt="Aspect photo" style="width: 100%; height: 100%; object-fit: cover;">
  </div>
  <script>
    window.__instanceId = Math.random().toString(36).slice(2);
  </script>
</body>
</html>`;

const PROJECT_ROW = {
  id: 'proj-img-resize-test',
  name: 'Image Resize Test',
  updatedAt: new Date().toISOString(),
  data: {
    studioMode: 'website',
    currentVersionIndex: 0,
    chatContextStartIndex: 0,
    currentChatSessionId: 'session-1',
    versions: [
      {
        id: 1,
        prompt: 'Build a gallery',
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

  const getPreviewFrame = async () => {
    const handle = await page.locator('iframe[data-appblips-browser="true"]').elementHandle();
    return handle.contentFrame();
  };

  await page.frameLocator('iframe[data-appblips-browser="true"]').locator('#photo').waitFor({ timeout: 15000 });
  let frame = await getPreviewFrame();
  const initialInstanceId = await frame.evaluate(() => window.__instanceId);

  await page.evaluate(() => {
    window.__iframeLoadCount = 0;
    document.addEventListener('load', (e) => {
      if (e.target && e.target.tagName === 'IFRAME') window.__iframeLoadCount += 1;
    }, true);
  });

  // Enable click-to-edit and click the image
  await page.getByRole('button', { name: 'Click-to-edit mode', exact: true }).click();
  await frame.locator('#photo').click();

  const widthInput = page.getByRole('textbox', { name: 'Image width', exact: true });
  const heightInput = page.getByRole('textbox', { name: 'Image height', exact: true });
  await widthInput.waitFor();
  assert.equal(await widthInput.inputValue(), '400');
  assert.equal(await heightInput.inputValue(), '200');

  // 1. Drag the SE corner handle inward by (-100, -50) -> 300 x 150
  const seHandle = frame.locator('[data-orion-resize-handle="se"]');
  await seHandle.waitFor();
  const box = await seHandle.boundingBox();
  assert.ok(box, 'SE resize handle is visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2 - 50, { steps: 5 });
  await page.mouse.up();

  const versionText = () => page.getByRole('group', { name: 'Version history' }).locator('.preview-version-count');
  await versionText().filter({ hasText: 'v2/2' }).waitFor();

  // Verify no reload & proportional update in both DOM and toolbar inputs
  assert.equal(await page.evaluate(() => window.__iframeLoadCount), 0, 'drag resize must not reload iframe');
  assert.equal(await frame.evaluate(() => window.__instanceId), initialInstanceId);
  const draggedRect = await frame.locator('#photo').boundingBox();
  assert.equal(Math.round(draggedRect.width), 300);
  assert.equal(Math.round(draggedRect.height), 150);
  assert.equal(await widthInput.inputValue(), '300');
  assert.equal(await heightInput.inputValue(), '150');

  // 2. Edit width with aspect lock ON -> height updates proportionally, then unlock & customize height -> Apply
  await widthInput.fill('200');
  assert.equal(await heightInput.inputValue(), '100', 'locked aspect ratio updates height proportionally');
  await page.getByRole('button', { name: 'Unlock aspect ratio', exact: true }).click();
  await heightInput.fill('160');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();

  await versionText().filter({ hasText: 'v3/3' }).waitFor();
  assert.equal(await page.evaluate(() => window.__iframeLoadCount), 0, 'toolbar size-only Apply must not reload iframe');
  assert.equal(await frame.evaluate(() => window.__instanceId), initialInstanceId);
  const appliedRect = await frame.locator('#photo').boundingBox();
  assert.equal(Math.round(appliedRect.width), 200);
  assert.equal(Math.round(appliedRect.height), 160);

  // 3. Undo restores v2 (300 x 150)
  await page.getByRole('button', { name: 'Previous version', exact: true }).click();
  await versionText().filter({ hasText: 'v2/3' }).waitFor();
  await page.waitForFunction(() => window.__iframeLoadCount >= 1);
  frame = await getPreviewFrame();
  await frame.locator('#photo').waitFor();
  const undoneRect = await frame.locator('#photo').boundingBox();
  assert.equal(Math.round(undoneRect.width), 300);
  assert.equal(Math.round(undoneRect.height), 150);

  // 4. Resize an image inside a fixed-size overflow:hidden container LARGER via drag handle,
  //    then even larger via toolbar W/H + Apply -> container expands with it without reloading iframe.
  await frame.locator('#card-photo').click();
  await widthInput.waitFor();
  assert.equal(await widthInput.inputValue(), '200');
  assert.equal(await heightInput.inputValue(), '100');

  const cardSeHandle = frame.locator('[data-orion-resize-handle="se"]');
  await cardSeHandle.waitFor();
  const cardHandleBox = await cardSeHandle.boundingBox();
  assert.ok(cardHandleBox, 'SE handle visible for card image');
  const loadsBeforeContainer = await page.evaluate(() => window.__iframeLoadCount);
  await page.mouse.move(cardHandleBox.x + cardHandleBox.width / 2, cardHandleBox.y + cardHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cardHandleBox.x + cardHandleBox.width / 2 + 100, cardHandleBox.y + cardHandleBox.height / 2 + 50, { steps: 5 });
  await page.mouse.up();

  await versionText().filter({ hasText: 'v3/3' }).waitFor();
  assert.equal(await page.evaluate(() => window.__iframeLoadCount), loadsBeforeContainer, 'drag-expanding container must not reload iframe');
  const draggedImgBox = await frame.locator('#card-photo').boundingBox();
  const draggedCardBox = await frame.locator('#photo-card').boundingBox();
  assert.equal(Math.round(draggedImgBox.width), 300);
  assert.equal(Math.round(draggedImgBox.height), 150);
  assert.ok(draggedCardBox.width >= 300, `expected container width >= 300 after drag, got ${draggedCardBox.width}`);
  assert.ok(draggedCardBox.height >= 150, `expected container height >= 150 after drag, got ${draggedCardBox.height}`);

  // Expand further via ElementToolbar Apply (400 x 200)
  await widthInput.fill('400');
  assert.equal(await heightInput.inputValue(), '200');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await versionText().filter({ hasText: 'v4/4' }).waitFor();
  assert.equal(await page.evaluate(() => window.__iframeLoadCount), loadsBeforeContainer, 'toolbar-expanding container must not reload iframe');
  const appliedImgBox = await frame.locator('#card-photo').boundingBox();
  const appliedCardBox = await frame.locator('#photo-card').boundingBox();
  assert.equal(Math.round(appliedImgBox.width), 400);
  assert.equal(Math.round(appliedImgBox.height), 200);
  assert.ok(appliedCardBox.width >= 400, `expected container width >= 400 after Apply, got ${appliedCardBox.width}`);
  assert.ok(appliedCardBox.height >= 200, `expected container height >= 200 after Apply, got ${appliedCardBox.height}`);

  // 5. Rounded containers preserve original corner shapes when images grow larger:
  //    (a) Circular container (border-radius: 50%) stretched horizontally keeps circular corners (9999px pill)
  await frame.locator('#circle-photo').click();
  const circleEHandle = frame.locator('[data-orion-resize-handle="e"]');
  await circleEHandle.waitFor();
  const circleHandleBox = await circleEHandle.boundingBox();
  await page.mouse.move(circleHandleBox.x + circleHandleBox.width / 2, circleHandleBox.y + circleHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(circleHandleBox.x + circleHandleBox.width / 2 + 100, circleHandleBox.y + circleHandleBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await versionText().filter({ hasText: 'v5/5' }).waitFor();
  const circleInfo = await frame.evaluate(() => {
    const c = document.getElementById('circle-card');
    const i = document.getElementById('circle-photo');
    return { cBox: c.getBoundingClientRect().toJSON(), iBox: i.getBoundingClientRect().toJSON(), br: getComputedStyle(c).borderRadius };
  });
  assert.equal(Math.round(circleInfo.iBox.width), 260);
  assert.equal(Math.round(circleInfo.cBox.width), 260);
  assert.equal(Math.round(circleInfo.cBox.height), 160);
  assert.equal(circleInfo.br, '9999px');

  //    (b) Percentage rounded corners (20% on 200x200 -> 40px) keep original 40px corner shape
  await frame.locator('#pct-photo').click();
  const pctEHandle = frame.locator('[data-orion-resize-handle="e"]');
  await pctEHandle.waitFor();
  const pctHandleBox = await pctEHandle.boundingBox();
  await page.mouse.move(pctHandleBox.x + pctHandleBox.width / 2, pctHandleBox.y + pctHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(pctHandleBox.x + pctHandleBox.width / 2 + 100, pctHandleBox.y + pctHandleBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await versionText().filter({ hasText: 'v6/6' }).waitFor();
  const pctInfo = await frame.evaluate(() => {
    const c = document.getElementById('pct-card');
    return { cBox: c.getBoundingClientRect().toJSON(), br: getComputedStyle(c).borderRadius };
  });
  assert.equal(Math.round(pctInfo.cBox.width), 300);
  assert.equal(pctInfo.br, '40px');

  //    (c) Auto-height image inside fixed-height rounded container expands container vertically too
  await frame.locator('#auto-h-photo').click();
  const autoEHandle = frame.locator('[data-orion-resize-handle="e"]');
  await autoEHandle.waitFor();
  const autoHandleBox = await autoEHandle.boundingBox();
  await page.mouse.move(autoHandleBox.x + autoHandleBox.width / 2, autoHandleBox.y + autoHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(autoHandleBox.x + autoHandleBox.width / 2 + 100, autoHandleBox.y + autoHandleBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await versionText().filter({ hasText: 'v7/7' }).waitFor();
  const autoInfo = await frame.evaluate(() => {
    const c = document.getElementById('auto-h-card');
    const i = document.getElementById('auto-h-photo');
    return { cBox: c.getBoundingClientRect().toJSON(), iBox: i.getBoundingClientRect().toJSON(), br: getComputedStyle(c).borderRadius };
  });
  assert.equal(Math.round(autoInfo.iBox.width), 340);
  assert.equal(Math.round(autoInfo.iBox.height), 170);
  assert.ok(autoInfo.cBox.height >= 170, `expected auto-h container height >= 170, got ${autoInfo.cBox.height}`);
  assert.equal(autoInfo.br, '24px');

  //    (d) Aspect-ratio rounded container resized in width clears aspect-ratio and keeps height & round corners
  await frame.locator('#aspect-photo').click();
  const aspectEHandle = frame.locator('[data-orion-resize-handle="e"]');
  await aspectEHandle.waitFor();
  const aspectHandleBox = await aspectEHandle.boundingBox();
  await page.mouse.move(aspectHandleBox.x + aspectHandleBox.width / 2, aspectHandleBox.y + aspectHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(aspectHandleBox.x + aspectHandleBox.width / 2 + 100, aspectHandleBox.y + aspectHandleBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await versionText().filter({ hasText: 'v8/8' }).waitFor();
  const aspectInfo = await frame.evaluate(() => {
    const c = document.getElementById('aspect-card');
    const i = document.getElementById('aspect-photo');
    return { cBox: c.getBoundingClientRect().toJSON(), iBox: i.getBoundingClientRect().toJSON(), br: getComputedStyle(c).borderRadius };
  });
  assert.equal(Math.round(aspectInfo.cBox.width), 260);
  assert.equal(Math.round(aspectInfo.cBox.height), 160);
  assert.equal(Math.round(aspectInfo.iBox.height), 160);
  assert.equal(aspectInfo.br, '24px');
  assert.equal(await page.evaluate(() => window.__iframeLoadCount), loadsBeforeContainer, 'rounded container resizes must not reload iframe');

  assert.deepEqual(pageErrors, []);
  console.log('ok - image resize handles and toolbar dimensions work seamlessly');
} finally {
  await browser.close();
  await viteServer.close();
}
