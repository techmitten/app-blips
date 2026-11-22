// Headless-browser test for click-to-edit's drag mode, end to end: a real
// mouse drags elements in the sandboxed preview bridge, the bridge's
// element-drop payload is fed to the deterministic engine
// (applyDirectEdit's `moveTo`), and the result is rendered again to prove it
// moved what it says.
//
//   npx playwright install chromium   # once
//   node testing/testDragMove.mjs
//
// Same sandboxed-iframe shape as the app (sandbox without
// allow-same-origin); the parent page only uses postMessage.

import { chromium } from '@playwright/test';
import { injectPreviewBridge } from '../src/previewBridge.js';
import { applyDirectEdit } from '../src/lib/directEdits.js';

const FIXTURE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Drag probe</title>
  <style>
    body { margin: 0; font-family: sans-serif; }
    section { padding: 2rem; }
    .cards { display: flex; gap: 2rem; }
    .card { padding: 1rem; border: 1px solid #ccc; width: 10rem; }
    img { display: block; width: 120px; height: 80px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
    .cell { padding: 1rem; border: 1px solid #ccc; }
    .tall { height: 1600px; }
  </style>
</head>
<body>
  <!-- @section: features -->
  <section id="features">
    <h2>Features</h2>
    <p class="lede">We are <strong>really</strong> fast.</p>
    <div class="cards">
      <div class="card"><h3>Fast</h3><p>Loads in a blink.</p></div>
      <div class="card"><h3>Safe</h3><p>Nothing leaves your device.</p></div>
      <div class="card"><h3>Free</h3><p>No account needed.</p></div>
    </div>
    <img src="https://example.test/photo.jpg" class="shot" alt="Shot">
    <ul class="steps">
      <li>Sign up</li>
      <li>Build</li>
    </ul>
  </section>

  <!-- @section: pricing -->
  <section id="pricing">
    <h2>Pricing</h2>
    <p>One plan.</p>
  </section>

  <!-- @section: gallery -->
  <section id="gallery">
    <h2>Gallery</h2>
    <div class="grid">
      <div class="cell">A1</div>
      <div class="cell">A2</div>
      <div class="cell">A3</div>
      <div class="cell">B1</div>
      <div class="cell">B2</div>
      <div class="cell">B3</div>
    </div>
  </section>

  <div class="tall"></div>
  <footer id="foot"><p>Footer note</p></footer>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.setContent(`<!DOCTYPE html><html><body style="margin:0">
<iframe id="f" sandbox="allow-scripts allow-forms allow-popups" style="width:1000px;height:700px;border:0;display:block"></iframe>
<script>
  window.__token = null;
  window.__selections = [];
  window.__drops = [];
  window.addEventListener('message', (e) => {
    if (!e.data) return;
    if (e.data.type === 'element-selected') window.__selections.push(e.data.payload);
    if (e.data.type === 'element-drop') window.__drops.push(e.data.payload);
  });
  window.__send = (type, payload) => document.getElementById('f').contentWindow.postMessage(
    { __orion: 'orion-preview-bridge', v: 1, token: window.__token, type, payload }, '*');
  window.__setSrc = (html) => { document.getElementById('f').srcdoc = html; };
</script>
</body></html>`);

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
};

let frame;
const setModes = async (enabled, drag) => {
  await page.evaluate((p) => window.__send('set-editing', p), { enabled, drag });
  await page.waitForTimeout(50);
};
const load = async (html, { drag = true, touch = false } = {}) => {
  const injected = injectPreviewBridge(html, { touchEnabled: touch });
  await page.evaluate((t) => { window.__token = t; window.__selections = []; window.__drops = []; }, injected.token);
  await page.evaluate((h) => window.__setSrc(h), injected.srcDoc);
  await page.waitForTimeout(50);
  frame = page.frames().find((x) => x !== page.mainFrame());
  await frame.waitForSelector('#features', { timeout: 10000 });
  await setModes(true, drag);
};
const fresh = (opts) => load(FIXTURE, opts);

// The iframe sits at the page origin, so frame coordinates are page ones.
const rectOf = (selector) => frame.evaluate((s) => {
  const r = document.querySelector(s).getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}, selector);

const chrome = () => frame.evaluate(() => [...document.querySelectorAll('div[data-orion-bridge]')].map((d) => ({
  role: d.getAttribute('data-orion-drag'),
  display: d.style.display,
  opacity: d.style.opacity,
  zIndex: Number(d.style.zIndex || 0),
  text: d.textContent.trim().slice(0, 40),
  width: parseFloat(d.style.width),
  height: parseFloat(d.style.height),
})));

// Press at `from`, move in steps to `to`, optionally inspect mid-drag, release.
const dragBetween = async (from, to, { during, release = true } = {}) => {
  await page.evaluate(() => { window.__drops = []; window.__selections = []; });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  // The bridge paints the drag once per animation frame.
  await page.waitForTimeout(50);
  const seen = during ? await during() : null;
  if (release) await page.mouse.up();
  // Long enough for the dropped copy's settle animation to finish.
  await page.waitForTimeout(300);
  const drops = await page.evaluate(() => window.__drops.slice());
  const selections = await page.evaluate(() => window.__selections.slice());
  return { seen, drops, selections };
};

const order = (html, selector) => {
  const texts = [];
  const re = new RegExp(`<${selector}>([^<]*)<`, 'g');
  let m;
  while ((m = re.exec(html))) texts.push(m[1]);
  return texts.join(',');
};

// --- reorder cards in a flex row: vertical insertion line, drop after -------
await fresh();
{
  const fast = await rectOf('.card:nth-child(1)');
  const free = await rectOf('.card:nth-child(3)');
  const { seen, drops } = await dragBetween(
    { x: fast.left + 4, y: fast.top + 4 },
    { x: free.right - 10, y: free.top + free.height / 2 },
    { during: chrome },
  );
  const line = seen?.find((c) => c.role === 'line' && c.display === 'block');
  const lift = seen?.find((c) => c.role === 'lift');
  check('drag shows a floating copy and an insertion line',
    seen?.length === 2 && !!lift && !!line, JSON.stringify(seen));
  check('insertion line paints above the floating copy at full opacity',
    !!line && !!lift && line.zIndex > lift.zIndex && line.opacity === '1', JSON.stringify({ line, lift }));
  check('the floating copy is the card', /^Fast/.test(seen?.find((c) => c.role === 'lift')?.text || ''), JSON.stringify(seen));
  check('row layout gets a vertical line', line && line.height > line.width, JSON.stringify(line));
  check('one drop is reported', drops.length === 1, `${drops.length}`);
  const drop = drops[0];
  check('card drop targets the last card, after it', drop?.target?.text === 'Free No account needed.' && drop?.position === 'after',
    `${drop?.target?.text} / ${drop?.position}`);
  check('dragged snapshot is the card', drop?.element?.tag === 'div' && /^Fast/.test(drop?.element?.text || ''));
  check('no outline paint leaks into the drop payload', drop && !/outline/.test(drop.element.outerHTML + drop.target.outerHTML));
  const result = drop && applyDirectEdit(FIXTURE, drop.element, { moveTo: { target: drop.target, position: drop.position } });
  check('card drop applies', result?.ok, result?.reason || result?.summary);
  check('cards reordered in source', result?.ok && order(result.code, 'h3') === 'Safe,Free,Fast', result?.ok && order(result.code, 'h3'));
  check('drag chrome is cleaned up', (await chrome()).length === 0);
  check('the click after a drag does not select', (await page.evaluate(() => window.__selections.length)) === 0);
}

// --- image to the top of the section: horizontal line, drop before ----------
await fresh();
{
  const img = await rectOf('img.shot');
  const h2 = await rectOf('#features h2');
  const { seen, drops } = await dragBetween(
    { x: img.left + 20, y: img.top + 20 },
    { x: h2.left + 30, y: h2.top + 3 },
    { during: chrome },
  );
  const line = seen?.find((c) => c.role === 'line' && c.display === 'block');
  check('column layout gets a horizontal line', line && line.width > line.height, JSON.stringify(line));
  const drop = drops[0];
  check('image drop targets the heading, before it', drop?.element?.tag === 'img' && drop?.target?.tag === 'h2' && drop?.position === 'before',
    `${drop?.element?.tag} -> ${drop?.target?.tag} ${drop?.position}`);
  const result = drop && applyDirectEdit(FIXTURE, drop.element, { moveTo: { target: drop.target, position: drop.position } });
  check('image drop applies', result?.ok, result?.reason || result?.summary);
  check('image now precedes the heading, re-indented',
    result?.ok && /<section id="features">\n {4}<img src="https:\/\/example\.test\/photo\.jpg" class="shot" alt="Shot">\n {4}<h2>Features<\/h2>/.test(result.code));
}

// --- grid row boundary: "after" the last cell of a row wraps to the next row -
await fresh();
{
  await frame.evaluate(() => document.getElementById('gallery').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(50);
  // A1 is the first cell of row 1, A3 the last. Dragging A1 onto A3's right
  // half means "after A3", but a grid has no slot to A3's right: the element
  // wraps to the start of the next row. While the drag is live the element is
  // collapsed, so the next row already starts at B2 (B1 slid up to fill A1's
  // row). The drop must retarget to B2, before it, so the line and the landing
  // agree instead of the element jumping a row away from the pointer.
  const a1 = await rectOf('.cell:nth-child(1)');
  const a3 = await rectOf('.cell:nth-child(3)');
  const { seen, drops } = await dragBetween(
    { x: a1.left + 4, y: a1.top + 4 },
    { x: a3.right - 8, y: a3.top + a3.height / 2 },
    { during: chrome },
  );
  const line = seen?.find((c) => c.role === 'line' && c.display === 'block');
  const drop = drops[0];
  check('last-cell drop retargets to the next row start',
    drop?.element?.tag === 'div' && /^A1/.test(drop?.element?.text || '') &&
    drop?.target?.tag === 'div' && /^B2/.test(drop?.target?.text || '') && drop?.position === 'before',
    `${drop?.element?.text} -> ${drop?.target?.text} ${drop?.position}`);
  check('the retargeted line is vertical', line && line.height > line.width, JSON.stringify(line));
  const result = drop && applyDirectEdit(FIXTURE, drop.element, { moveTo: { target: drop.target, position: drop.position } });
  check('grid move applies', result?.ok, result?.reason || result?.summary);
  check('the cell lands at the start of the next row in source',
    result?.ok && /<div class="cell">A2<\/div>\n {6}<div class="cell">A3<\/div>\n {6}<div class="cell">B1<\/div>\n {6}<div class="cell">A1<\/div>\n {6}<div class="cell">B2<\/div>/.test(result.code),
    result?.reason || '');
}

// --- an image can be dropped into a card nested in its sibling row ---------
await fresh();
{
  const img = await rectOf('img.shot');
  const safeP = await rectOf('.card:nth-child(2) p');
  const { drops } = await dragBetween(
    { x: img.left + 20, y: img.top + 20 },
    { x: safeP.left + 10, y: safeP.bottom - 2 },
  );
  const drop = drops[0];
  check('image targets content inside a sibling row', drop?.target?.tag === 'p' && drop?.position === 'after'
    && /Nothing leaves/.test(drop?.target?.text || ''), `${drop?.target?.tag} ${drop?.position}`);
  const result = drop && applyDirectEdit(FIXTURE, drop.element, { moveTo: { target: drop.target, position: drop.position } });
  check('image lands inside the card', result?.ok
    && /<p>Nothing leaves your device\.<\/p> <img src="https:\/\/example\.test\/photo\.jpg" class="shot" alt="Shot"><\/div>/.test(result.code),
    result?.reason || '');
}

// --- a word inside a paragraph drags its paragraph, into another section ----
await fresh();
{
  const strong = await rectOf('.lede strong');
  const pricingP = await rectOf('#pricing p');
  const { drops } = await dragBetween(
    { x: strong.left + 5, y: strong.top + 5 },
    { x: pricingP.left + 10, y: pricingP.bottom - 3 },
  );
  const drop = drops[0];
  check('inline word promotes to its paragraph', drop?.element?.tag === 'p' && /really/.test(drop?.element?.text || ''), drop?.element?.tag);
  const result = drop && applyDirectEdit(FIXTURE, drop.element, { moveTo: { target: drop.target, position: drop.position } });
  check('paragraph moves into the pricing section',
    result?.ok && /<p>One plan\.<\/p>\n {4}<p class="lede">We are <strong>really<\/strong> fast\.<\/p>\n {2}<\/section>/.test(result.code),
    result?.reason || '');
}

// --- a selected container drags from anywhere inside it ---------------------
await fresh();
{
  const safe = await rectOf('.card:nth-child(2)');
  await frame.locator('.card:nth-child(2)').click({ position: { x: 3, y: 3 } });
  await page.waitForTimeout(50);
  const safeH3 = await rectOf('.card:nth-child(2) h3');
  const fast = await rectOf('.card:nth-child(1)');
  const { drops } = await dragBetween(
    { x: safeH3.left + 5, y: safeH3.top + 5 },
    { x: fast.left + 10, y: fast.top + fast.height / 2 },
  );
  const drop = drops[0];
  check('pressing inside the selection drags the selection', drop?.element?.tag === 'div' && /^Safe/.test(drop?.element?.text || '')
    && /^Fast/.test(drop?.target?.text || '') && drop?.position === 'before', `${drop?.element?.tag} ${drop?.element?.text}`);
  check('selection sanity', safe.width > 0);
}

// --- lists stay valid: a paragraph over a list item drops beside the list ---
await fresh();
{
  const pricingP = await rectOf('#pricing p');
  const li = await rectOf('.steps li:nth-child(1)');
  const { drops } = await dragBetween(
    { x: pricingP.left + 5, y: pricingP.top + 5 },
    { x: li.left + 10, y: li.top + 3 },
  );
  const drop = drops[0];
  check('non-item never lands between list items', drop?.target?.tag === 'ul', drop?.target?.tag);

  const li2 = await rectOf('.steps li:nth-child(2)');
  const { drops: liDrops } = await dragBetween(
    { x: li2.left + 5, y: li2.top + 5 },
    { x: li.left + 10, y: li.top + 2 },
  );
  check('list items reorder among list items', liDrops[0]?.target?.tag === 'li' && liDrops[0]?.position === 'before',
    `${liDrops[0]?.target?.tag} ${liDrops[0]?.position}`);
}

// --- plain clicks, no-op drops, Escape --------------------------------------
await fresh();
{
  const h2 = await rectOf('#pricing h2');
  const { drops } = await dragBetween({ x: h2.left + 5, y: h2.top + 5 }, { x: h2.left + 8, y: h2.top + 6 });
  check('a jitter below the threshold is a click that edits text without dropping',
    drops.length === 0 && (await frame.evaluate(() => !!document.querySelector('#pricing h2[contenteditable]'))),
    `${drops.length} drops`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(50);

  const card1 = await rectOf('.card:nth-child(1)');
  const cardClick = await dragBetween({ x: card1.left + 3, y: card1.top + 3 }, { x: card1.left + 3, y: card1.top + 3 });
  check('clicking a card below threshold selects it without dropping',
    cardClick.drops.length === 0 && cardClick.selections[0]?.tag === 'div',
    `${cardClick.drops.length} drops, ${cardClick.selections[0]?.tag}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(50);

  const fast = await rectOf('.card:nth-child(1)');
  const safe = await rectOf('.card:nth-child(2)');
  const self = await dragBetween({ x: fast.left + 4, y: fast.top + 4 }, { x: fast.left + 30, y: fast.top + 30 });
  check('dropping on itself reports nothing', self.drops.length === 0);
  // While a drag is live the element is collapsed out of layout, so "before
  // the card that followed it" is where the first card used to be (the next
  // card has slid into its slot). Dropping there is still a no-op.
  const beside = await dragBetween({ x: fast.left + 4, y: fast.top + 4 }, { x: fast.left + 8, y: fast.top + fast.height / 2 });
  check('dropping where it already is reports nothing', beside.drops.length === 0, JSON.stringify(beside.drops[0]?.position));

  const esc = await dragBetween(
    { x: fast.left + 4, y: fast.top + 4 },
    { x: safe.right - 5, y: safe.top + safe.height / 2 },
    { release: false },
  );
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(300);
  const afterEsc = await page.evaluate(() => window.__drops.length);
  check('Escape cancels the drag', esc.drops.length === 0 && afterEsc === 0 && (await chrome()).length === 0);
}

// --- auto-scroll near the bottom edge ---------------------------------------
await fresh();
{
  const h2 = await rectOf('#pricing h2');
  await page.mouse.move(h2.left + 5, h2.top + 5);
  await page.mouse.down();
  await page.mouse.move(h2.left + 40, 690, { steps: 8 });
  await page.waitForTimeout(700);
  const scrolled = await frame.evaluate(() => window.scrollY);
  check('holding near the bottom edge scrolls the page', scrolled > 100, `scrollY=${scrolled}`);
  await page.mouse.up();
}

// --- click-to-edit without drag mode never drags ----------------------------
await fresh({ drag: false });
{
  const fast = await rectOf('.card:nth-child(1)');
  const free = await rectOf('.card:nth-child(3)');
  const { drops, seen } = await dragBetween({ x: fast.left + 4, y: fast.top + 4 }, { x: free.right - 10, y: free.top + 20 }, { during: chrome });
  check('no drag outside drag mode', drops.length === 0 && seen.every((c) => c.role !== 'lift' && c.role !== 'line'), `${drops.length} drops`);

  const h2 = await rectOf('#pricing h2');
  await frame.locator('#pricing h2').click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(50);
  check('text still edits in place outside drag mode', await frame.evaluate(() => !!document.querySelector('#pricing h2[contenteditable]')), `${h2.top}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(50);

  // Turning drag on keeps the selection and picker cursor, so a picked container drags.
  await page.evaluate(() => { window.__selections = []; });
  await frame.locator('.card:nth-child(3)').click({ position: { x: 3, y: 3 } });
  await page.waitForTimeout(50);
  await setModes(true, true);
  const cursor = await frame.evaluate(() => getComputedStyle(document.querySelector('.card')).cursor);
  check('unified editing keeps picker cursor', cursor === 'crosshair', cursor);
  const freeH3 = await rectOf('.card:nth-child(3) h3');
  const { drops: kept } = await dragBetween({ x: freeH3.left + 5, y: freeH3.top + 5 }, { x: fast.left + 10, y: fast.top + fast.height / 2 });
  check('selection survives turning drag on', kept[0]?.element?.tag === 'div' && /^Free/.test(kept[0]?.element?.text || '')
    && kept[0]?.position === 'before', `${kept[0]?.element?.tag} ${kept[0]?.element?.text}`);

  // Clicking text still edits in place even while drag is enabled.
  await frame.locator('#pricing h2').click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(50);
  check('text edits in place while drag is enabled', await frame.evaluate(() => !!document.querySelector('#pricing h2[contenteditable]')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(50);

  await setModes(true, false);
  const back = await frame.evaluate(() => getComputedStyle(document.querySelector('.card')).cursor);
  check('turning drag off keeps the picker cursor', back === 'crosshair', back);
}

// --- turning editing off disables dragging -----------------------------------
await fresh();
{
  await setModes(false, true);
  const fast = await rectOf('.card:nth-child(1)');
  const free = await rectOf('.card:nth-child(3)');
  const { drops } = await dragBetween({ x: fast.left + 4, y: fast.top + 4 }, { x: free.right - 10, y: free.top + 20 });
  check('no drag while editing is off', drops.length === 0);
}

// --- image drag-and-drop: size preservation, nested padding/cards, wrappers -
const IMG_FIXTURE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Image drag probe</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: sans-serif; }
    .section { padding: 48px 32px; }
    .container { max-width: 900px; margin: 0 auto; }
    .cols { display: grid; grid-template-columns: 1fr 220px; gap: 32px; }
    .narrow-wrap { width: 200px; overflow: hidden; border-radius: 12px; }
    .fluid-img { display: block; width: 100%; height: 120px; object-fit: cover; }
    ul.cards-ul { list-style: none; padding: 0; margin: 24px 0 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
    li.card-li { background: #f8fafc; border-radius: 12px; padding: 16px; }
    figure.frame { margin: 0; overflow: hidden; height: 140px; border-radius: 12px; }
    .gallery-grid { display: grid; grid-template-columns: repeat(2, 220px); gap: 16px; margin-top: 24px; }
  </style>
</head>
<body>
  <section id="features" class="section">
    <div class="container">
      <div class="cols">
        <div class="left-col">
          <h2>Headline</h2>
          <p>Lead copy</p>
        </div>
        <div class="right-col">
          <div class="narrow-wrap">
            <img id="inset-img" src="https://example.test/inset.jpg" class="fluid-img" alt="Inset">
          </div>
        </div>
      </div>
      <ul class="cards-ul">
        <li class="card-li">
          <figure class="frame"><img id="card1-img" src="https://example.test/c1.jpg" class="fluid-img" alt="C1"></figure>
          <div class="card-body"><h3>Card 1</h3><p>Desc 1</p></div>
        </li>
        <li class="card-li">
          <figure class="frame"><img id="card2-img" src="https://example.test/c2.jpg" class="fluid-img" alt="C2"></figure>
          <div class="card-body"><h3>Card 2</h3><p>Desc 2</p></div>
        </li>
        <li class="card-li">
          <figure class="frame"><img id="card3-img" src="https://example.test/c3.jpg" class="fluid-img" alt="C3"></figure>
          <div class="card-body"><h3>Card 3</h3><p>Desc 3</p></div>
        </li>
      </ul>
      <div class="gallery-grid">
        <figure class="frame"><img id="g1" src="https://example.test/g1.jpg" class="fluid-img" alt="G1"></figure>
        <figure class="frame"><img id="g2" src="https://example.test/g2.jpg" class="fluid-img" alt="G2"></figure>
      </div>
    </div>
  </section>
</body>
</html>`;

await load(IMG_FIXTURE);
{
  const insetBefore = await rectOf('#inset-img');
  const h2 = await rectOf('h2');
  const { drops } = await dragBetween(
    { x: insetBefore.left + insetBefore.width / 2, y: insetBefore.top + insetBefore.height / 2 },
    { x: h2.left + 20, y: h2.top + 3 },
  );
  const drop = drops[0];
  check('fluid image carries preserveSize when moved to wider column',
    !!drop?.preserveSize && drop.preserveSize.width === `${Math.round(insetBefore.width)}px`,
    JSON.stringify(drop?.preserveSize));
  const res = drop && applyDirectEdit(IMG_FIXTURE, drop.element, {
    moveTo: { target: drop.target, position: drop.position, preserveSize: drop.preserveSize },
  });
  check('fluid image move applies', res?.ok, res?.reason || res?.summary);
  if (res?.ok) {
    await load(res.code);
    const insetAfter = await rectOf('#inset-img');
    check('moved image keeps its original width instead of expanding to fill wider destination',
      Math.abs(insetAfter.width - insetBefore.width) <= 2 && Math.abs(insetAfter.height - insetBefore.height) <= 2,
      `${Math.round(insetBefore.width)}x${Math.round(insetBefore.height)} -> ${Math.round(insetAfter.width)}x${Math.round(insetAfter.height)}`);
  }
}

await load(IMG_FIXTURE);
{
  const c1Img = await rectOf('#card1-img');
  const sec = await rectOf('#features');
  const { drops: padDrops } = await dragBetween(
    { x: c1Img.left + 20, y: c1Img.top + 20 },
    { x: sec.left + 60, y: sec.top + 24 },
  );
  check('dropping an image into same-section outer padding resolves a valid target',
    padDrops.length === 1 && padDrops[0]?.target?.attributes?.class === 'cols' && padDrops[0]?.position === 'before',
    `${padDrops.length} drops, target=${padDrops[0]?.target?.tag}.${padDrops[0]?.target?.attributes?.class} ${padDrops[0]?.position}`);
}

await load(IMG_FIXTURE);
{
  const c1Img = await rectOf('#card1-img');
  const c2Li = await rectOf('li.card-li:nth-child(2)');
  const { drops: liDrops } = await dragBetween(
    { x: c1Img.left + 20, y: c1Img.top + 20 },
    { x: c2Li.left + 8, y: c2Li.bottom - 8 },
  );
  check('dropping an image onto another li card padding lands inside that card instead of failing',
    liDrops.length === 1 && liDrops[0]?.target?.tag !== 'ul',
    `${liDrops.length} drops, target=${liDrops[0]?.target?.tag}`);
}

await load(IMG_FIXTURE);
{
  const g1 = await rectOf('#g1');
  const g2 = await rectOf('#g2');
  const { drops: galDrops } = await dragBetween(
    { x: g1.left + 20, y: g1.top + 20 },
    { x: g2.right - 15, y: g2.top + g2.height / 2 },
  );
  check('dropping an image onto a figure-wrapped gallery image targets beside the figure wrapper',
    galDrops.length === 1 && galDrops[0]?.target?.tag === 'figure' && galDrops[0]?.position === 'after',
    `${galDrops.length} drops, target=${galDrops[0]?.target?.tag} ${galDrops[0]?.position}`);
}

// Fast release without waiting for rAF still lands at the release point.
await load(IMG_FIXTURE);
{
  const inset = await rectOf('#inset-img');
  const h2 = await rectOf('h2');
  await page.evaluate(() => { window.__drops = []; });
  await page.mouse.move(inset.left + 20, inset.top + 20);
  await page.mouse.down();
  await page.mouse.move(h2.left + 20, h2.top + 3, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  const fastDrops = await page.evaluate(() => window.__drops.slice());
  check('fast drag release still drops at the release coordinates',
    fastDrops.length === 1 && fastDrops[0]?.target?.tag === 'h2',
    `${fastDrops.length} drops, target=${fastDrops[0]?.target?.tag}`);
}

// Mobile/tablet touch simulation must not scroll instead of dragging in drag mode.
await load(IMG_FIXTURE, { drag: true, touch: true });
{
  const inset = await rectOf('#inset-img');
  const h2 = await rectOf('h2');
  const { drops: touchDrops } = await dragBetween(
    { x: inset.left + 20, y: inset.top + 20 },
    { x: h2.left + 20, y: h2.top + 3 },
  );
  check('mouse drag in drag mode still works when touch simulation is enabled',
    touchDrops.length === 1 && touchDrops[0]?.target?.tag === 'h2',
    `${touchDrops.length} drops, target=${touchDrops[0]?.target?.tag}`);
}

// Moving an image out of a fixed-height frame and moving it back in keeps the card's original height.
const ROUNDTRIP_FIXTURE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Roundtrip</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: sans-serif; }
    .wrap { max-width: 800px; margin: 0 auto; padding: 24px; display: grid; grid-template-columns: 240px 1fr; gap: 24px; align-items: start; }
    .solo-card { width: 220px; background: #f8fafc; padding: 12px; }
    .solo-frame { margin: 0; height: 140px; overflow: hidden; }
    .solo-img { display: block; width: 100%; height: 100%; object-fit: cover; }
  </style>
</head>
<body>
  <div id="features" class="wrap">
    <div class="solo-card">
      <figure class="solo-frame"><img id="rt-img" src="https://example.test/rt.jpg" class="solo-img" alt="RT"></figure>
      <h3>Card</h3>
    </div>
    <div class="right-pane"><h2>Top</h2></div>
  </div>
</body>
</html>`;

await load(ROUNDTRIP_FIXTURE);
{
  const cardBefore = await rectOf('.solo-card');
  const imgBefore = await rectOf('#rt-img');
  const h2 = await rectOf('h2');
  const { drops: outDrops } = await dragBetween(
    { x: imgBefore.left + 20, y: imgBefore.top + 20 },
    { x: h2.left + 20, y: h2.top + 3 },
  );
  const outDrop = outDrops[0];
  const rOut = outDrop && applyDirectEdit(ROUNDTRIP_FIXTURE, outDrop.element, {
    moveTo: {
      target: outDrop.target,
      position: outDrop.position,
      ...(outDrop.preserveSize ? { preserveSize: outDrop.preserveSize } : {}),
      ...(outDrop.cleanupWrapper ? { cleanupWrapper: true } : {}),
    },
  });
  check('moving image out of solo-frame removes empty wrapper', rOut?.ok && !/<figure/.test(rOut.code), rOut?.reason || '');
  if (rOut?.ok) {
    await load(rOut.code);
    const imgMid = await rectOf('#rt-img');
    const cardH3 = await rectOf('.solo-card h3');
    const { drops: backDrops } = await dragBetween(
      { x: imgMid.left + 20, y: imgMid.top + 20 },
      { x: cardH3.left + 20, y: cardH3.top + 3 },
    );
    const backDrop = backDrops[0];
    const rBack = backDrop && applyDirectEdit(rOut.code, backDrop.element, {
      moveTo: {
        target: backDrop.target,
        position: backDrop.position,
        ...(backDrop.preserveSize ? { preserveSize: backDrop.preserveSize } : {}),
        ...(backDrop.cleanupWrapper ? { cleanupWrapper: true } : {}),
      },
    });
    check('moving image back into card applies', rBack?.ok, rBack?.reason || '');
    if (rBack?.ok) {
      await load(rBack.code);
      const cardAfter = await rectOf('.solo-card');
      check('card height stays the same after moving image out and back in',
        Math.abs(cardAfter.height - cardBefore.height) <= 2,
        `${Math.round(cardBefore.height)}px -> ${Math.round(cardAfter.height)}px`);
    }
  }
}

// Logical image placement: no drops into navbars, sticky headers, form controls,
// accordion summaries, or naked between top-level sections.
const LOGICAL_FIXTURE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Logical spots</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: sans-serif; }
    header.topbar { position: sticky; top: 0; background: #fff; padding: 12px 24px; }
    section { padding: 32px; }
    img { display: block; width: 120px; height: 80px; }
  </style>
</head>
<body>
  <header class="topbar">
    <nav><a href="#hero">Home</a> <a href="#faq">FAQ</a></nav>
  </header>
  <section id="faq">
    <h2>FAQ</h2>
    <details open>
      <summary>How does it work?</summary>
      <p>Answer text.</p>
    </details>
    <form>
      <label for="em">Email</label>
      <input id="em" type="email">
    </form>
  </section>
  <section id="features">
    <h2>Hero</h2>
    <img id="hero-img" src="https://example.test/hero.jpg" alt="Hero">
  </section>
</body>
</html>`;

await load(LOGICAL_FIXTURE);
{
  const heroImg = await rectOf('#hero-img');
  const navLink = await rectOf('header nav a');
  const { drops: navDrops } = await dragBetween(
    { x: heroImg.left + 20, y: heroImg.top + 20 },
    { x: navLink.left + 10, y: navLink.top + 5 },
  );
  check('image cannot be dropped into sticky nav', navDrops.length === 0, `${navDrops.length} drops`);

  const faqSec = await rectOf('#faq');
  const { drops: secDrops } = await dragBetween(
    { x: heroImg.left + 20, y: heroImg.top + 20 },
    { x: faqSec.left + 40, y: faqSec.top + 2 },
  );
  check('image dropped on section edge lands inside the section instead of between sections',
    secDrops.length === 1 && secDrops[0]?.target?.tag === 'h2',
    `${secDrops.length} drops, target=${secDrops[0]?.target?.tag}`);

  const summary = await rectOf('details summary');
  const { drops: sumDrops } = await dragBetween(
    { x: heroImg.left + 20, y: heroImg.top + 20 },
    { x: summary.left + 20, y: summary.top + 3 },
  );
  check('image dropped on summary targets the details container instead of breaking summary',
    sumDrops.length === 1 && sumDrops[0]?.target?.tag === 'details',
    `${sumDrops.length} drops, target=${sumDrops[0]?.target?.tag}`);

  const label = await rectOf('form label');
  const { drops: formDrops } = await dragBetween(
    { x: heroImg.left + 20, y: heroImg.top + 20 },
    { x: label.left + 10, y: label.top + 3 },
  );
  check('image dropped on form label targets the form container instead of breaking form controls',
    formDrops.length === 1 && formDrops[0]?.target?.tag === 'form',
    `${formDrops.length} drops, target=${formDrops[0]?.target?.tag}`);
}

// Text & containers: same width preservation, wrapper cleanup, and logical placement rules.
const TEXT_CONTAINER_FIXTURE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Text and containers</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: sans-serif; }
    header.topbar { position: sticky; top: 0; background: #fff; padding: 12px 24px; }
    section { padding: 24px; }
    .wide { max-width: 800px; }
    .narrow-col { width: 220px; }
    .solo-box { overflow: hidden; height: 90px; background: #f1f5f9; padding: 12px; }
    .nested-card { background: #e2e8f0; padding: 12px; }
  </style>
</head>
<body>
  <header class="topbar">
    <nav><a href="#features">Home</a></nav>
  </header>
  <section id="features">
    <div class="wide">
      <h2 id="wide-h2">Wide Heading</h2>
    </div>
    <div class="narrow-col">
      <div class="solo-box"><p id="narrow-p">Short column text that stays narrow.</p></div>
      <div class="nested-card"><p>Card body</p></div>
    </div>
  </section>
  <section id="second">
    <h2>Second Section</h2>
    <p>Second copy</p>
  </section>
</body>
</html>`;

await load(TEXT_CONTAINER_FIXTURE);
{
  const narrowP = await rectOf('#narrow-p');
  const wideH2 = await rectOf('#wide-h2');
  const { drops } = await dragBetween(
    { x: narrowP.left + 10, y: narrowP.top + 5 },
    { x: wideH2.left + 20, y: wideH2.top + 3 },
  );
  const d = drops[0];
  check('narrow text moved to wide section preserves its max-width and cleans empty wrapper',
    !!d?.preserveSize?.maxWidth && d.cleanupWrapper === true,
    JSON.stringify({ preserveSize: d?.preserveSize, cleanupWrapper: d?.cleanupWrapper }));
  const res = d && applyDirectEdit(TEXT_CONTAINER_FIXTURE, d.element, {
    moveTo: {
      target: d.target,
      position: d.position,
      ...(d.preserveSize ? { preserveSize: d.preserveSize } : {}),
      ...(d.cleanupWrapper ? { cleanupWrapper: true } : {}),
    },
  });
  check('text move with wrapper cleanup applies', res?.ok && !/<div class="solo-box"/.test(res.code), res?.reason || '');
  if (res?.ok) {
    await load(res.code);
    const movedP = await rectOf('#narrow-p');
    check('moved text keeps its narrow width instead of stretching across wide section',
      movedP.width <= narrowP.width + 2, `${Math.round(narrowP.width)}px -> ${Math.round(movedP.width)}px`);
  }
}

await load(TEXT_CONTAINER_FIXTURE);
{
  // Select nested card and drag it: preserves width when moved to wide section, blocked from sticky nav.
  await frame.locator('.nested-card').click({ position: { x: 4, y: 4 } });
  await page.waitForTimeout(50);
  const card = await rectOf('.nested-card');
  const wideH2 = await rectOf('#wide-h2');
  const { drops: cardDrops } = await dragBetween(
    { x: card.left + 10, y: card.top + 10 },
    { x: wideH2.left + 20, y: wideH2.top + 3 },
  );
  check('narrow container moved to wide section carries width preserveSize',
    cardDrops.length === 1 && cardDrops[0]?.preserveSize?.width === `${Math.round(card.width)}px`,
    JSON.stringify(cardDrops[0]?.preserveSize));

  const navLink = await rectOf('header nav a');
  const { drops: navDrops } = await dragBetween(
    { x: card.left + 10, y: card.top + 10 },
    { x: navLink.left + 10, y: navLink.top + 5 },
  );
  check('container cannot be dropped into sticky nav', navDrops.length === 0, `${navDrops.length} drops`);
}

await load(TEXT_CONTAINER_FIXTURE);
{
  // Top-level sections can still reorder among top-level sections.
  await frame.locator('#second').click({ position: { x: 4, y: 4 } });
  await page.waitForTimeout(50);
  const second = await rectOf('#second');
  const features = await rectOf('#features');
  const { drops: secReorder } = await dragBetween(
    { x: second.left + 10, y: second.top + 10 },
    { x: features.left + 20, y: features.top + 10 },
  );
  check('top-level section can still be dragged before another top-level section',
    secReorder.length === 1 && secReorder[0]?.target?.tag === 'section' && secReorder[0]?.position === 'before',
    `${secReorder.length} drops, target=${secReorder[0]?.target?.tag} ${secReorder[0]?.position}`);
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall drag-to-move checks passed');
process.exitCode = failures ? 1 : 0;
