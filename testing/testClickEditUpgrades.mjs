// End-to-end Playwright regression suite for the upgraded click-to-edit visual
// editor experience:
//   1. Distinct visual states for hover, selection, and active text editing
//   2. Editing the second of two identical headings (plus draft preservation when ambiguous)
//   3. Formatting a phrase inside a paragraph that also contains a link
//   4. Typing and immediately switching targets in one click
//   5. Editing a link and a button in place (label + destination), then following in preview mode
//   6. Replacing an image in context (from "My images" gallery & file upload) + editing alt text while preserving layout
//   7. Navigating nested selections up to parent card/section and back down to child
//   8. Undo/redo visual edits + full persistence after reopening the project
//   9. Desktop and narrow (390x844) viewports, including popovers and controls near screen edges
//
//   node testing/testClickEditUpgrades.mjs

import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const SAMPLE_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Artisan Bakery</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; color: #0f172a; }
    section { padding: 32px; }
    .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 16px; }
    .card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; background: #ffffff; }
    .btn { display: inline-block; padding: 10px 18px; background: #d97706; color: #fff; text-decoration: none; border-radius: 8px; }
    .cta-btn { padding: 10px 18px; background: #0f172a; color: #fff; border: 0; border-radius: 8px; cursor: pointer; }
    #hero-img { width: 240px; height: 150px; object-fit: cover; border-radius: 10px; display: block; }
    #contact { margin-top: 900px; padding: 40px; background: #f8fafc; border-top: 2px solid #e2e8f0; }
  </style>
</head>
<body>
  <section id="hero-section">
    <h1 id="main-headline">Fresh Sourdough Daily</h1>
    <p id="intro-para">We bake with organic stone-ground flour. Check our <a id="inline-link" href="#contact">seasonal menu</a> for morning specials.</p>
    <a id="cta-link" href="#old-target" class="btn">Order Online</a>
    <button id="action-btn" class="cta-btn">Book Tasting</button>
    <img id="hero-img" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='150'><rect width='240' height='150' fill='%23e2e8f0'/></svg>" alt="Original bakery photo" />
  </section>

  <section id="specials-section">
    <div class="cards">
      <div class="card" id="card-1">
        <h3>Morning Croissant</h3>
        <p>Flaky butter layers</p>
      </div>
      <div class="card" id="card-2">
        <h3>Morning Croissant</h3>
        <p>Flaky butter layers</p>
      </div>
    </div>
  </section>

  <section id="dynamic-section">
    <div id="clone-host">
      <div class="dyn-card"><h4>Daily Batch</h4></div>
    </div>
  </section>

  <section id="contact">
    <h2>Visit Our Kitchen</h2>
  </section>

  <script>
    // Clone .dyn-card in the live DOM so there are 2 identical <h4>Daily Batch</h4>
    // sharing the same source tag (exercising the ambiguous source fallback).
    const host = document.getElementById('clone-host');
    const first = host && host.querySelector('.dyn-card');
    if (host && first && host.children.length === 1) {
      host.appendChild(first.cloneNode(true));
    }
  </script>
</body>
</html>`;

const SAMPLE_ABOUT_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>About Bakery</title></head>
<body>
  <h1 id="about-title">About Our Bakers</h1>
  <a id="back-home" href="index.html">Back Home</a>
</body>
</html>`;

const PROJECT_ROW = {
  id: 'proj-click-edit-upgrades',
  name: 'Bakery Visual Editor Test',
  updatedAt: new Date().toISOString(),
  data: {
    studioMode: 'website',
    currentVersionIndex: 0,
    chatContextStartIndex: 0,
    currentChatSessionId: 'session-1',
    versions: [
      {
        id: 1,
        prompt: 'Build an artisan bakery website',
        files: {
          'index.html': SAMPLE_INDEX_HTML,
          'about.html': SAMPLE_ABOUT_HTML,
        },
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
    if (window === window.top && !sessionStorage.getItem('__test_seeded')) {
      sessionStorage.setItem('__test_seeded', 'true');
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
  await liveFrame().locator('#main-headline').waitFor({ timeout: 15000 });

  const evalInLiveFrame = async (fn, arg) => {
    const handle = await page.locator('iframe[data-appblips-browser="true"]').elementHandle();
    const f = await handle.contentFrame();
    return f.evaluate(fn, arg);
  };
  const versionText = () => page.getByRole('group', { name: 'Version history' }).locator('.preview-version-count');

  // Enable click-to-edit mode
  await page.getByRole('button', { name: 'Click-to-edit mode', exact: true }).click();

  // ---------------------------------------------------------------------------
  // 1. Visual distinction: Hover vs. Selection vs. Active Text Editing
  // ---------------------------------------------------------------------------
  await liveFrame().locator('#cta-link').hover();
  await page.waitForTimeout(80);
  const hoverState = await evalInLiveFrame(() => {
    const el = document.getElementById('cta-link');
    const badge = document.querySelector('[data-orion-badge="true"]');
    return {
      outline: el.style.outline,
      badgeState: badge?.getAttribute('data-orion-state'),
      badgeText: badge?.textContent,
    };
  });
  assert.match(hoverState.outline, /dashed/, 'hover state uses dashed outline');
  assert.equal(hoverState.badgeState, 'hover', 'hover state shows hover badge');

  await liveFrame().locator('#cta-link').click();
  await page.getByRole('toolbar', { name: /Edit selected/i }).waitFor();
  const selectedState = await evalInLiveFrame(() => {
    const el = document.getElementById('cta-link');
    const badge = document.querySelector('[data-orion-badge="true"]');
    return {
      outline: el.style.outline,
      badgeState: badge?.getAttribute('data-orion-state'),
      badgeText: badge?.textContent,
    };
  });
  assert.match(selectedState.outline, /solid/, 'selected state uses solid outline');
  assert.equal(selectedState.badgeState, 'selected', 'selected state shows selected badge');
  assert.match(selectedState.badgeText || '', /Selected/i);

  await liveFrame().locator('#main-headline').click();
  await page.getByRole('toolbar', { name: 'Format text', exact: true }).waitFor();
  const editingState = await evalInLiveFrame(() => {
    const el = document.getElementById('main-headline');
    const badge = document.querySelector('[data-orion-badge="true"]');
    return {
      outline: el.style.outline,
      outlineOffset: el.style.outlineOffset,
      cursor: getComputedStyle(el).cursor,
      badgeState: badge?.getAttribute('data-orion-state'),
      badgeText: badge?.textContent,
    };
  });
  assert.notEqual(editingState.outline, selectedState.outline, 'active text editing outline is distinct from selection outline');
  assert.equal(editingState.outlineOffset, '3px');
  assert.equal(editingState.cursor, 'text', 'active text editing shows text cursor');
  assert.equal(editingState.badgeState, 'editing', 'active text editing shows editing badge');
  assert.match(editingState.badgeText || '', /Editing/i);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  console.log('ok - 1. hover, selection, and active text editing states are visually distinct');

  // ---------------------------------------------------------------------------
  // 2. Edit the second of two identical headings + preserve draft when ambiguous
  // ---------------------------------------------------------------------------
  const secondCardH3 = liveFrame().locator('.card h3').nth(1);
  await secondCardH3.click();
  await page.getByRole('toolbar', { name: 'Format text', exact: true }).waitFor();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Almond Bostock');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await versionText().filter({ hasText: 'v2/2' }).waitFor();

  assert.equal(await liveFrame().locator('.card h3').nth(0).innerText(), 'Morning Croissant', 'first identical heading is untouched');
  assert.equal(await liveFrame().locator('.card h3').nth(1).innerText(), 'Almond Bostock', 'second identical heading updated');

  // Dynamic/ambiguous clone: editing the 2nd script-cloned <h4>Daily Batch</h4>
  // must NOT overwrite the single template in source, and must preserve the draft!
  const secondDynH4 = liveFrame().locator('.dyn-card h4').nth(1);
  await secondDynH4.click();
  await page.getByRole('toolbar', { name: 'Format text', exact: true }).waitFor();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Evening Brioche');
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  const editBar = page.getByRole('toolbar', { name: /Edit selected/i });
  await editBar.waitFor();
  const aiInput = editBar.getByRole('textbox', { name: 'Describe the change for AI' });
  await aiInput.waitFor();
  assert.match(await aiInput.inputValue(), /Evening Brioche/, 'preserved draft prefilled into AI instruction input');
  assert.match(await editBar.innerText(), /Evening Brioche/, 'draft badge displays preserved text');
  assert.ok(await editBar.getByRole('button', { name: 'Apply with AI' }).isEnabled(), 'Apply with AI is enabled with preserved draft');
  await editBar.getByRole('button', { name: 'Close editor' }).click();
  console.log('ok - 2. editing second of two identical headings updates only its source; ambiguous source preserves draft');

  // ---------------------------------------------------------------------------
  // 3. Format one phrase inside a paragraph that also contains a link
  // ---------------------------------------------------------------------------
  await liveFrame().locator('#intro-para').click({ position: { x: 15, y: 10 } });
  const formatBar = page.getByRole('toolbar', { name: 'Format text', exact: true });
  await formatBar.waitFor();

  // Select "organic stone-ground" inside #intro-para
  await evalInLiveFrame(() => {
    const p = document.getElementById('intro-para');
    const textNode = p.firstChild;
    const start = textNode.nodeValue.indexOf('organic stone-ground');
    const r = document.createRange();
    r.setStart(textNode, start);
    r.setEnd(textNode, start + 'organic stone-ground'.length);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.waitForTimeout(100);

  const boldBtn = formatBar.getByRole('button', { name: 'Bold', exact: true });
  assert.equal(await boldBtn.getAttribute('aria-pressed'), 'false');
  await boldBtn.click();
  await page.waitForTimeout(100);
  assert.equal(await boldBtn.getAttribute('aria-pressed'), 'true', 'Bold button reflects formatted selection typography');

  // Also apply Italic to the same selection and verify it reuses the single span
  const italicBtn = formatBar.getByRole('button', { name: 'Italic', exact: true });
  await italicBtn.click();
  await page.waitForTimeout(100);
  assert.equal(await italicBtn.getAttribute('aria-pressed'), 'true', 'Italic button reflects formatted selection typography');

  await formatBar.getByRole('button', { name: 'Done', exact: true }).click();
  await versionText().filter({ hasText: 'v3/3' }).waitFor();

  const paraInfo = await evalInLiveFrame(() => {
    const p = document.getElementById('intro-para');
    const spans = p.querySelectorAll('span');
    const link = p.querySelector('a#inline-link');
    return {
      spanCount: spans.length,
      spanText: spans[0]?.textContent,
      spanWeight: spans[0]?.style.fontWeight,
      spanStyle: spans[0]?.style.fontStyle,
      linkHref: link?.getAttribute('href'),
      linkText: link?.textContent,
    };
  });
  assert.equal(paraInfo.spanCount, 1, 'reused single span without nesting duplicates');
  assert.equal(paraInfo.spanText, 'organic stone-ground');
  assert.equal(paraInfo.spanWeight, '700');
  assert.equal(paraInfo.spanStyle, 'italic');
  assert.equal(paraInfo.linkHref, '#contact', 'link inside paragraph preserved');
  assert.equal(paraInfo.linkText, 'seasonal menu', 'link text inside paragraph preserved');
  console.log('ok - 3. formatted one phrase inside a paragraph containing a link');

  // ---------------------------------------------------------------------------
  // 4. Type and immediately switch targets in one click
  // ---------------------------------------------------------------------------
  await liveFrame().locator('#main-headline').click();
  await formatBar.waitFor();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Artisan Sourdough & Rye');

  // Immediately click the first card's paragraph without clicking Done first
  const firstCardP = liveFrame().locator('#card-1 p');
  await firstCardP.click();
  await versionText().filter({ hasText: 'v4/4' }).waitFor();
  await formatBar.waitFor();
  assert.equal(await liveFrame().locator('#main-headline').innerText(), 'Artisan Sourdough & Rye', 'first target committed on switch');

  // Now type in #card-1 p and immediately click #cta-link (a link/button target)
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Cultured Normandy butter');
  await liveFrame().locator('#cta-link').click();
  await versionText().filter({ hasText: 'v5/5' }).waitFor();
  await editBar.waitFor();
  assert.equal(await liveFrame().locator('#card-1 p').innerText(), 'Cultured Normandy butter', 'second target committed on switch to link');
  console.log('ok - 4. typing and immediately switching targets commits and activates the new target in one click');

  // ---------------------------------------------------------------------------
  // 5. Edit a link and a button in place (label + destination) & follow in preview
  // ---------------------------------------------------------------------------
  const linkLabelInput = editBar.getByLabel('Link label');
  const linkUrlInput = editBar.getByLabel('Link URL');
  await linkLabelInput.fill('Visit Kitchen');
  await linkUrlInput.fill('#contact');
  await editBar.getByRole('button', { name: 'Apply', exact: true }).click();
  await versionText().filter({ hasText: 'v6/6' }).waitFor();
  await page.waitForTimeout(150);
  await liveFrame().locator('#cta-link').waitFor();
  assert.equal(await liveFrame().locator('#cta-link').innerText(), 'Visit Kitchen');
  assert.equal(await liveFrame().locator('#cta-link').getAttribute('href'), '#contact');

  // Also edit <button id="action-btn">: change its label and set destination to about.html
  await liveFrame().locator('#action-btn').click();
  await editBar.waitFor();
  const btnLabelInput = editBar.getByLabel('Button label');
  await btnLabelInput.fill('Meet Our Bakers');
  await editBar.getByLabel('Link URL').fill('about.html');
  await editBar.getByRole('button', { name: 'Apply', exact: true }).click();
  await versionText().filter({ hasText: 'v7/7' }).waitFor();
  await page.waitForTimeout(150);
  await liveFrame().locator('#action-btn').waitFor();
  assert.equal(await liveFrame().locator('#action-btn').innerText(), 'Meet Our Bakers');
  assert.equal(await liveFrame().locator('#action-btn').getAttribute('href'), 'about.html');

  // Turn off click-to-edit mode and follow both updated links in preview mode!
  await page.getByRole('button', { name: 'Click-to-edit mode', exact: true }).click();
  await liveFrame().locator('#cta-link').click();
  await page.waitForTimeout(200);
  const scrolledY = await evalInLiveFrame(() => window.scrollY);
  assert.ok(scrolledY > 200, `expected #contact link to scroll page, scrollY=${scrolledY}`);

  // Scroll back up and click the updated <button href="about.html"> to navigate to about.html
  await evalInLiveFrame(() => window.scrollTo(0, 0));
  await liveFrame().locator('#action-btn').click();
  await liveFrame().locator('#about-title').waitFor({ timeout: 10000 });
  // Follow the link back to index.html
  await liveFrame().locator('#back-home').click();
  await liveFrame().locator('#main-headline').waitFor({ timeout: 10000 });
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: 'Click-to-edit mode', exact: true }).click();
  await page.waitForTimeout(100);
  console.log('ok - 5. edited link and button label + destination in place and followed both in preview mode');

  // ---------------------------------------------------------------------------
  // 6. Replace an image in context (upload + My images picker + alt text) preserving layout
  // ---------------------------------------------------------------------------
  const beforeImgBox = await liveFrame().locator('#hero-img').boundingBox();
  await liveFrame().locator('#hero-img').click();
  await editBar.waitFor();

  // Upload an image via ElementToolbar's Upload button (adds to My images gallery as images/...)
  const fileInput = editBar.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: 'fresh-loaf.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
  });
  await page.waitForFunction(() => {
    const inp = document.querySelector('input[aria-label="Image URL"]');
    return inp && /^images\/fresh-loaf\.(png|webp)$/.test(inp.value);
  });

  // Edit alt text right in context
  const altInput = editBar.getByRole('textbox', { name: 'Alt text' });
  await altInput.fill('Crusty sourdough loaf on wooden board');
  await editBar.getByRole('button', { name: 'Apply', exact: true }).click();
  await versionText().filter({ hasText: 'v8/8' }).waitFor();
  await page.waitForTimeout(150);
  await liveFrame().locator('#hero-img').waitFor();

  const afterImgBox = await liveFrame().locator('#hero-img').boundingBox();
  assert.equal(Math.round(afterImgBox.width), Math.round(beforeImgBox.width), 'image width preserved after replacement');
  assert.equal(Math.round(afterImgBox.height), Math.round(beforeImgBox.height), 'image height preserved after replacement');
  assert.equal(await liveFrame().locator('#hero-img').getAttribute('alt'), 'Crusty sourdough loaf on wooden board');

  // Verify "Choose from My images" picker now lists fresh-loaf
  await liveFrame().locator('#hero-img').click();
  await editBar.waitFor();
  await editBar.getByRole('button', { name: 'Choose from My images' }).click();
  const galleryDialog = editBar.getByRole('dialog', { name: 'My images' });
  await galleryDialog.waitFor();
  assert.ok(await galleryDialog.getByRole('option', { name: /fresh-loaf\.(png|webp)/i }).isVisible(), 'uploaded image appears in My images picker');
  await page.keyboard.press('Escape'); // closes My images popover
  await editBar.getByRole('button', { name: 'Close editor' }).click();
  console.log('ok - 6. replaced image in context via My images gallery flow and edited alt text while preserving layout');

  // ---------------------------------------------------------------------------
  // 7. Navigate nested selections (text -> card -> section -> back to child)
  // ---------------------------------------------------------------------------
  await liveFrame().locator('#card-1 h3').click();
  await formatBar.waitFor();
  assert.match(await formatBar.locator('.element-bar-chip').innerText(), /Heading \(H3\)/);

  // Navigate directly from TextFormatToolbar to parent (.card)
  await formatBar.getByRole('button', { name: 'Select parent element' }).click();
  await editBar.waitFor();
  await editBar.locator('.element-bar-chip', { hasText: 'Card' }).waitFor();
  assert.equal(await evalInLiveFrame(() => document.querySelector('#card-1')?.style.outline.includes('solid')), true);

  // Navigate up again to .cards container
  await editBar.getByRole('button', { name: 'Select parent element' }).click();
  await editBar.locator('.element-bar-chip', { hasText: 'Container' }).waitFor();

  // Navigate back down to child (.card) and then to <h3> without losing place
  const selectChildBtn = editBar.getByRole('button', { name: 'Select child element' });
  await selectChildBtn.click();
  await editBar.locator('.element-bar-chip', { hasText: 'Card' }).waitFor();
  await selectChildBtn.click();
  await editBar.locator('.element-bar-chip', { hasText: 'Heading (H3)' }).waitFor();
  await editBar.getByRole('button', { name: 'Close editor' }).click();
  console.log('ok - 7. navigated nested selections from text to parent card/container and back to child');

  // ---------------------------------------------------------------------------
  // 8. Undo/Redo visual edits + Persistence after reopening the project
  // ---------------------------------------------------------------------------
  await page.getByRole('button', { name: 'Previous version', exact: true }).click();
  await versionText().filter({ hasText: 'v7/8' }).waitFor();
  await page.waitForTimeout(150);
  await liveFrame().locator('#hero-img').waitFor();
  assert.equal(await liveFrame().locator('#hero-img').getAttribute('alt'), 'Original bakery photo', 'Undo restored previous image alt');

  await page.getByRole('button', { name: 'Next version', exact: true }).click();
  await versionText().filter({ hasText: 'v8/8' }).waitFor();
  await page.waitForTimeout(150);
  await liveFrame().locator('#hero-img').waitFor();
  assert.equal(await liveFrame().locator('#hero-img').getAttribute('alt'), 'Crusty sourdough loaf on wooden board', 'Redo restored updated image alt');

  // Reload the page (reopen project) and verify all edits persisted
  await page.reload({ waitUntil: 'domcontentloaded' });
  await liveFrame().locator('#main-headline').waitFor({ timeout: 15000 });
  await page.waitForTimeout(150);
  assert.equal(await liveFrame().locator('#main-headline').innerText(), 'Artisan Sourdough & Rye');
  assert.equal(await liveFrame().locator('.card h3').nth(0).innerText(), 'Morning Croissant');
  assert.equal(await liveFrame().locator('.card h3').nth(1).innerText(), 'Almond Bostock');
  assert.equal(await liveFrame().locator('#cta-link').innerText(), 'Visit Kitchen');
  assert.equal(await liveFrame().locator('#cta-link').getAttribute('href'), '#contact');
  assert.equal(await liveFrame().locator('#action-btn').innerText(), 'Meet Our Bakers');
  assert.equal(await liveFrame().locator('#action-btn').getAttribute('href'), 'about.html');
  assert.equal(await liveFrame().locator('#hero-img').getAttribute('alt'), 'Crusty sourdough loaf on wooden board');
  console.log('ok - 8. undo/redo and persistence after reopening project verified');

  // ---------------------------------------------------------------------------
  // 9. Narrow viewport (390x844) & edge-clamped popovers/controls
  // ---------------------------------------------------------------------------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  // Switch mobile header from Chat to Preview on narrow viewports
  const mobilePreviewTab = page.locator('header').getByRole('button', { name: 'Preview', exact: true });
  if (await mobilePreviewTab.isVisible()) {
    await mobilePreviewTab.click();
    await page.waitForTimeout(150);
  }
  await page.getByRole('button', { name: 'Click-to-edit mode', exact: true }).click();
  await page.waitForTimeout(100);

  // Check TextFormatToolbar and its Color popover on 390px viewport
  await liveFrame().locator('#main-headline').click();
  await formatBar.waitFor();
  await formatBar.getByRole('button', { name: /Text color/i }).click();
  const colorPopBox = await formatBar.getByRole('dialog', { name: 'Text color' }).boundingBox();
  assert.ok(colorPopBox.x >= 0 && colorPopBox.x + colorPopBox.width <= 390, `color popover fits 390px viewport: ${JSON.stringify(colorPopBox)}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await liveFrame().locator('#cta-link').click();
  await editBar.waitFor();
  const closeBtnBox = await editBar.getByRole('button', { name: 'Close editor' }).boundingBox();
  assert.ok(closeBtnBox.x >= 0 && closeBtnBox.x + closeBtnBox.width <= 390, `Close editor button fits 390px viewport: ${JSON.stringify(closeBtnBox)}`);
  console.log('ok - 9. narrow viewport (390x844) controls and popovers stay within screen edges');

  assert.deepEqual(pageErrors, []);
  console.log('\nALL CLICK-TO-EDIT UPGRADE CHECKS PASSED');
} finally {
  await browser.close();
  await viteServer.close();
}
