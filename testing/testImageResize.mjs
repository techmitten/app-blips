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
  <div id="multi-card" style="width: 320px; border: 1px solid #cbd5e1; padding: 8px;">
    <div id="multi-img-wrap" style="width: 280px; height: 140px; overflow: hidden;">
      <img id="multi-photo" src="${SVG_DATA_URI}" alt="Multi photo" width="200" height="100">
    </div>
    <p>Caption text</p>
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

  // 6. Container lock right-click option:
  //    (a) Does not appear when right-clicking non-image elements (e.g. heading)
  await frame.locator('h1').click({ button: 'right' });
  const copyItem = page.getByRole('menuitem', { name: 'Copy', exact: true });
  await copyItem.waitFor();
  assert.equal(await page.getByRole('menuitemcheckbox', { name: 'Container lock', exact: true }).count(), 0, 'Container lock must not appear for non-image elements');
  await page.keyboard.press('Escape');

  //    (b) Shrinking #multi-photo WITHOUT Container lock leaves #multi-img-wrap at 280x140
  await frame.locator('#multi-photo').click();
  await widthInput.waitFor();
  await widthInput.fill('160');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await versionText().filter({ hasText: 'v9/9' }).waitFor();
  const unlockedShrinkInfo = await frame.evaluate(() => {
    const w = document.getElementById('multi-img-wrap');
    const i = document.getElementById('multi-photo');
    return { wBox: w.getBoundingClientRect().toJSON(), iBox: i.getBoundingClientRect().toJSON() };
  });
  assert.equal(Math.round(unlockedShrinkInfo.iBox.width), 160);
  assert.equal(Math.round(unlockedShrinkInfo.iBox.height), 80);
  assert.equal(Math.round(unlockedShrinkInfo.wBox.width), 280, 'without Container lock, container stays 280px wide');
  assert.equal(Math.round(unlockedShrinkInfo.wBox.height), 140, 'without Container lock, container stays 140px tall');

  //    (c) Right-clicking an image shows Container lock (initially unchecked); clicking it toggles it ON
  await frame.locator('#multi-photo').click({ button: 'right' });
  const lockItem = page.getByRole('menuitemcheckbox', { name: 'Container lock', exact: true });
  await lockItem.waitFor();
  assert.equal(await lockItem.getAttribute('aria-checked'), 'false');
  await lockItem.click();
  await lockItem.waitFor({ state: 'detached' });

  //    Re-opening right-click menu on an image shows Container lock checked
  await frame.locator('#multi-photo').click({ button: 'right' });
  await lockItem.waitFor();
  assert.equal(await lockItem.getAttribute('aria-checked'), 'true');
  await page.keyboard.press('Escape');

  //    (d) Shrinking #multi-photo via drag handle with Container lock ON shrinks #multi-img-wrap to match,
  //        while #multi-card (which also holds <p>Caption text</p>) does NOT shrink to image size
  await frame.locator('#multi-photo').click();
  const multiSeHandle = frame.locator('[data-orion-resize-handle="se"]');
  await multiSeHandle.waitFor();
  const multiHandleBox = await multiSeHandle.boundingBox();
  await page.mouse.move(multiHandleBox.x + multiHandleBox.width / 2, multiHandleBox.y + multiHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(multiHandleBox.x + multiHandleBox.width / 2 - 40, multiHandleBox.y + multiHandleBox.height / 2 - 20, { steps: 5 });
  await page.mouse.up();
  await versionText().filter({ hasText: 'v10/10' }).waitFor();
  assert.equal(await page.evaluate(() => window.__iframeLoadCount), loadsBeforeContainer, 'Container lock drag shrink must not reload iframe');
  const lockedMultiInfo = await frame.evaluate(() => {
    const outer = document.getElementById('multi-card');
    const w = document.getElementById('multi-img-wrap');
    const i = document.getElementById('multi-photo');
    return { outerBox: outer.getBoundingClientRect().toJSON(), wBox: w.getBoundingClientRect().toJSON(), iBox: i.getBoundingClientRect().toJSON() };
  });
  assert.equal(Math.round(lockedMultiInfo.iBox.width), 120);
  assert.equal(Math.round(lockedMultiInfo.iBox.height), 60);
  assert.equal(Math.round(lockedMultiInfo.wBox.width), 120, 'single-image container width locks to shrunk image');
  assert.equal(Math.round(lockedMultiInfo.wBox.height), 60, 'single-image container height locks to shrunk image');
  assert.ok(lockedMultiInfo.outerBox.width >= 320, `multi-element outer card must stay >= 320px, got ${lockedMultiInfo.outerBox.width}`);

  //    (e) Previously-grown container (#photo-card, 400x200 with min-width/min-height) shrinks cleanly
  //        via ElementToolbar W/H + Apply when Container lock is ON (preserving its 2px border)
  await frame.locator('#card-photo').click();
  await widthInput.waitFor();
  assert.equal(await widthInput.inputValue(), '400');
  await widthInput.fill('160');
  assert.equal(await heightInput.inputValue(), '80');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await versionText().filter({ hasText: 'v11/11' }).waitFor();
  assert.equal(await page.evaluate(() => window.__iframeLoadCount), loadsBeforeContainer, 'Container lock toolbar shrink must not reload iframe');
  const shrunkCardInfo = await frame.evaluate(() => {
    const c = document.getElementById('photo-card');
    const i = document.getElementById('card-photo');
    return { cBox: c.getBoundingClientRect().toJSON(), iBox: i.getBoundingClientRect().toJSON() };
  });
  assert.equal(Math.round(shrunkCardInfo.iBox.width), 160);
  assert.equal(Math.round(shrunkCardInfo.iBox.height), 80);
  assert.equal(Math.round(shrunkCardInfo.cBox.width), 164, 'photo-card outer width = 160 + 4px border');
  assert.equal(Math.round(shrunkCardInfo.cBox.height), 84, 'photo-card outer height = 80 + 4px border');

  //    (f) Toggling Container lock OFF stops subsequent smaller resizes from shrinking the container
  await frame.locator('#card-photo').click({ button: 'right' });
  await lockItem.waitFor();
  assert.equal(await lockItem.getAttribute('aria-checked'), 'true');
  await lockItem.click();
  await lockItem.waitFor({ state: 'detached' });

  await frame.locator('#card-photo').click();
  await widthInput.waitFor();
  await widthInput.fill('100');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await versionText().filter({ hasText: 'v12/12' }).waitFor();
  const reUnlockedInfo = await frame.evaluate(() => {
    const c = document.getElementById('photo-card');
    const i = document.getElementById('card-photo');
    return { cBox: c.getBoundingClientRect().toJSON(), iBox: i.getBoundingClientRect().toJSON() };
  });
  assert.equal(Math.round(reUnlockedInfo.iBox.width), 100);
  assert.equal(Math.round(reUnlockedInfo.iBox.height), 50);
  assert.equal(Math.round(reUnlockedInfo.cBox.width), 164, 'after Container lock OFF, container stays 164px');
  assert.equal(Math.round(reUnlockedInfo.cBox.height), 84, 'after Container lock OFF, container stays 84px');

  assert.deepEqual(pageErrors, []);
  console.log('ok - image resize handles and toolbar dimensions work seamlessly');
} finally {
  await browser.close();
  await viteServer.close();
}
