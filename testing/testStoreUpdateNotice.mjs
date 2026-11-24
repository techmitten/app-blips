// Run (Linux needs a display: xvfb-run -a node testing/testStoreUpdateNotice.mjs)
// after `npm run build && node scripts/build-electron.js`.
// The update notice in the real desktop app: a Microsoft Store install
// (faked with helpers/fakeWindowsStore.cjs) checks GitHub and opens the Store.
// A snap checks the Snap Store and opens App Center; other installs link to GitHub. GitHub's
// answer is mocked, so no network is needed. HOME/XDG_CONFIG_HOME point at a
// temp folder, so the user's real projects and settings are never touched.
import assert from 'node:assert/strict';
import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_CACHE_KEY } from '../src/lib/updates.js';

const fakeStore = fileURLToPath(new URL('./helpers/fakeWindowsStore.cjs', import.meta.url));
const fakeSnap = fileURLToPath(new URL('./helpers/fakeSnapStore.cjs', import.meta.url));
const releaseUrl = 'https://github.com/TechMitten/app-blips/releases/tag/v99.0.0';

async function launch({ store = false, snap = false } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'appblips-update-'));
  await mkdir(join(home, '.config', 'appblips'), { recursive: true });
  await writeFile(join(home, '.config', 'appblips', 'settings.json'), JSON.stringify({ projectsRoot: join(home, 'Projects') }));
  // An existing provider file marks first-run onboarding as done.
  await writeFile(join(home, '.config', 'appblips', 'provider.json'), '{}');
  const app = await electron.launch({
    args: store ? ['-r', fakeStore, '.'] : snap ? ['-r', fakeSnap, '.'] : ['.'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', HOME: home, XDG_CONFIG_HOME: join(home, '.config'), ...(snap ? { SNAP: '/snap/appblips/1' } : {}) },
  });
  const githubCalls = [];
  await app.context().route('https://api.github.com/**', (route) => {
    githubCalls.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tag_name: 'v99.0.0', html_url: releaseUrl, draft: false, prerelease: false }),
    });
  });
  // Links leave the app through shell.openExternal; record them instead.
  await app.evaluate(({ shell }) => {
    globalThis.opened = [];
    shell.openExternal = async (url) => { globalThis.opened.push(url); };
  });
  const page = await app.firstWindow();
  // The first check may have gone out before the route was in place.
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate((key) => localStorage.removeItem(key), CHECK_CACHE_KEY);
  githubCalls.length = 0;
  await page.reload();
  const close = async () => {
    await app.close();
    await rm(home, { recursive: true, force: true });
  };
  return { app, page, githubCalls, close };
}

async function otherInstall(options) {
  const { app, page, githubCalls, close } = await launch(options);
  try {
    const notice = page.getByRole('status').filter({ hasText: 'AppBlips 99.0.0 is available' });
    await notice.waitFor({ timeout: 20000 });
    const check = await page.evaluate(() => window.appblipsDesktop.updates.check());
    const link = notice.getByRole('link');
    const result = { check, text: await notice.innerText(), label: await link.innerText(), href: await link.getAttribute('href'), githubCalls: [...githubCalls] };
    await page.screenshot({ path: join(tmpdir(), 'appblips-update-other.png') });
    await link.click();
    if (!options?.store && !options?.snap) await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect.poll(() => app.evaluate(() => globalThis.opened.length)).toBe(1);
    result.opened = await app.evaluate(() => globalThis.opened);
    if (options?.store || options?.snap) {
      await notice.getByRole('button', { name: 'Dismiss', exact: true }).click();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('tab', { name: 'Workspace', exact: true }).click();
      await page.getByRole('button', { name: 'Check now', exact: true }).click();
      const answer = page.getByRole('status').filter({ hasText: 'AppBlips 99.0.0 is available' });
      await answer.waitFor();
      await answer.getByRole('button', { name: options.snap ? 'Open App Center' : 'Open Microsoft Store', exact: true }).click();
      await expect.poll(() => app.evaluate(() => globalThis.opened)).toEqual([result.href, result.href]);
      assert.equal(await answer.getByRole('link', { name: 'Download', exact: true }).count(), 0);
    }
    return result;
  } finally {
    await close();
  }
}

const store = await otherInstall({ store: true });
assert.equal(store.check.store, 'microsoft', 'main reports a Microsoft Store install');
assert.equal(store.label, 'Open Microsoft Store');
assert.equal(store.href, 'ms-windows-store://pdp/?productid=9NK9SS4V2N1K');
assert.match(store.text, /while Microsoft approves/);
assert.ok(store.githubCalls.length > 0);
assert.deepEqual(store.opened, [store.href]);

const snap = await otherInstall({ snap: true });
assert.equal(snap.check.store, 'snap', 'main reports a snap install');
assert.equal(snap.label, 'Open App Center');
assert.equal(snap.href, 'snap://appblips');
assert.match(snap.text, /Close AppBlips/);
assert.deepEqual(snap.opened, ['snap://appblips']);
assert.deepEqual(snap.githubCalls, [], 'a snap install never asks GitHub');

const other = await otherInstall();
assert.ok(!other.check.store);
assert.equal(other.label, 'Download');
assert.equal(other.href, releaseUrl);
assert.doesNotMatch(other.text, /Microsoft Store/);
assert.deepEqual(other.opened, [releaseUrl], 'clicking opens the release');

console.log('ok: Microsoft Store opens the Store, snap opens App Center, other installs link to the release');
