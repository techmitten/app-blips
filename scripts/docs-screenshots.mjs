// Regenerates the screenshots in docs/images/screens/ from the running dev
// server, with seeded projects (scripts/docsScreenshots/fixtures.js), so no AI
// provider or tokens are needed.
//
//   npm run dev                          (in another terminal)
//   node scripts/docs-screenshots.mjs    [shot names to only redo those]
//
// DOCS_SHOTS_URL overrides the server address. Each shot is written as WebP.
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { seedProjects } from './docsScreenshots/fixtures.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs/images/screens');
const url = process.env.DOCS_SHOTS_URL || 'http://127.0.0.1:5175';
const only = process.argv.slice(2);
const VIEWPORT = { width: 1280, height: 800 };
// The website toolbar (page picker, Edit Mode) needs more room than an app's.
const WIDE = { width: 1440, height: 900 };
const SCALE = 2;

const settle = (page, ms = 600) => page.waitForTimeout(ms);
const frame = (page) => page.frameLocator('.preview-canvas iframe:not(.pointer-events-none)').first();

async function openPage(browser, { projectId = '', viewport = VIEWPORT } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: SCALE, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.warn('  page error:', error.message));
  await page.addInitScript(([projects, current]) => {
    if (window !== window.top || sessionStorage.getItem('docs-seeded')) return;
    sessionStorage.setItem('docs-seeded', '1');
    localStorage.clear();
    localStorage.setItem('orion-theme', 'dark');
    localStorage.setItem('appblips-tour-v1', 'dismissed');
    localStorage.setItem('appblips-tour-v2', 'dismissed');
    localStorage.setItem('orion-legal-agreement', JSON.stringify({ terms: '2026-11-17', privacy: '2026-11-17', agreedAt: new Date().toISOString() }));
    localStorage.setItem('orion-profile', JSON.stringify({ name: 'Sam', avatar: 'rocket' }));
    localStorage.setItem('appblips-web-provider', JSON.stringify({ enabled: false, onboardingComplete: true }));
    localStorage.setItem('orion-projects', JSON.stringify(projects));
    if (current) localStorage.setItem('orion-current-project-id', current);
  }, [seedProjects(), projectId]);
  await page.goto(url, { waitUntil: 'networkidle' });
  await settle(page, 1200);
  return page;
}

async function openProject(page, name) {
  await page.locator('.hero-rail').getByRole('button', { name, exact: true }).first().click();
  await page.locator('.preview-canvas iframe').first().waitFor();
  await settle(page, 2000);
}

async function save(page, name, clip, { park = true } = {}) {
  // Park the pointer off every control so no tooltip or hover peek shows.
  if (park) {
    const { width, height } = page.viewportSize();
    await page.mouse.move(width - 2, height - 2);
    await settle(page, 500);
  }
  const png = await page.screenshot(clip ? { clip } : {});
  await sharp(png).webp({ quality: 86 }).toFile(path.join(outDir, `${name}.webp`));
  const meta = await sharp(png).metadata();
  console.log(`  ${name}.webp  ${meta.width / SCALE}x${meta.height / SCALE}`);
}

// A clip around several elements, padded and kept inside the viewport.
async function around(page, locators, pad = 16) {
  const boxes = (await Promise.all(locators.map((l) => l.boundingBox()))).filter(Boolean);
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.min(page.viewportSize().width, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const bottom = Math.min(page.viewportSize().height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  return { x, y, width: right - x, height: bottom - y };
}

const shots = {
  async 'start-screen'(browser) {
    const page = await openPage(browser);
    await save(page, 'start-screen');
    return page;
  },

  async 'new-app-prompt'(browser) {
    const page = await openPage(browser);
    await page.locator('#prompt').waitFor();
    await page.locator('#prompt').fill('A tip calculator. I enter the bill, pick a tip percentage and the number of people, and it shows the tip and the total per person.');
    await settle(page);
    await save(page, 'new-app-prompt');
    return page;
  },

  async workspace(browser) {
    const page = await openPage(browser);
    await openProject(page, 'Tip Splitter');
    await save(page, 'workspace');
    return page;
  },

  async 'code-tab'(browser) {
    const page = await openPage(browser);
    await openProject(page, 'Tip Splitter');
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    await settle(page, 1200);
    await save(page, 'code-tab');
    return page;
  },

  async 'history-drawer'(browser) {
    const page = await openPage(browser);
    await openProject(page, 'Tip Splitter');
    await page.locator('.hero-rail [data-tour="history"]').click();
    await settle(page, 900);
    await save(page, 'history-drawer');
    return page;
  },

  async 'website-desktop'(browser) {
    const page = await openPage(browser, { viewport: WIDE });
    await openProject(page, 'Ray’s Ski Resort');
    await page.waitForLoadState('networkidle');
    await settle(page, 2000);
    await save(page, 'website-desktop');
    return page;
  },

  async 'edit-mode'(browser) {
    const page = await openPage(browser, { viewport: WIDE });
    await openProject(page, 'Hearth & Crumb');
    await page.locator('[data-tour="edit"]').click();
    await settle(page);
    await frame(page).locator('.hero h1').click();
    await settle(page, 900);
    await save(page, 'edit-mode');
    return page;
  },

  async 'right-click-menu'(browser) {
    const page = await openPage(browser, { viewport: WIDE });
    await openProject(page, 'Hearth & Crumb');
    await page.locator('[data-tour="edit"]').click();
    await settle(page);
    await frame(page).locator('.hero p').click({ button: 'right' });
    await settle(page, 900);
    await save(page, 'right-click-menu', null, { park: false });
    return page;
  },

  async 'publish-dialog'(browser) {
    const page = await openPage(browser, { viewport: WIDE });
    await openProject(page, 'Hearth & Crumb');
    await page.locator('[data-tour="publish"]').click();
    await settle(page, 1200);
    await save(page, 'publish-dialog', await around(page, [page.getByRole('dialog').last()], 24));
    return page;
  },

  async 'settings-ai'(browser) {
    const page = await openPage(browser);
    await page.locator('.hero-rail [data-tour="settings"]').click();
    await settle(page, 800);
    await page.getByRole('tab', { name: 'AI', exact: true }).click().catch(() => page.getByRole('button', { name: 'AI', exact: true }).click());
    await settle(page, 800);
    await save(page, 'settings-ai', await around(page, [page.getByRole('dialog').last()], 24));
    return page;
  },

  async extensions(browser) {
    const page = await openPage(browser);
    await page.locator('.hero-rail').getByRole('button', { name: 'Extensions', exact: true }).click();
    await settle(page, 1000);
    await save(page, 'extensions', await around(page, [page.getByRole('dialog').last()], 24));
    return page;
  },

  async showcase(browser) {
    const page = await openPage(browser);
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await page.waitForLoadState('networkidle');
    await settle(page, 2500);
    await save(page, 'showcase');
    return page;
  },
};

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
let failed = 0;
try {
  for (const [name, run] of Object.entries(shots)) {
    if (only.length && !only.includes(name)) continue;
    console.log(name);
    let page;
    try {
      page = await run(browser);
    } catch (error) {
      failed += 1;
      console.error(`  failed: ${error.message.split('\n')[0]}`);
      await rm(path.join(outDir, `${name}.webp`), { force: true }).catch(() => {});
    } finally {
      await page?.context().close();
    }
  }
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;

