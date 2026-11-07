// Run (Linux needs a display: xvfb-run -a node testing/testStoreUpdateNotice.mjs)
// after `npm run build && node scripts/build-electron.js`.
// The update notice in the real desktop app: a Microsoft Store install
// (faked with helpers/fakeWindowsStore.cjs) shows none and never asks GitHub
// (the Store updates it, and approves new versions days after the GitHub
// release), any other install that doesn't update itself links to the release. GitHub's
// answer is mocked, so no network is needed. HOME/XDG_CONFIG_HOME point at a
// temp folder, so the user's real projects and settings are never touched.
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_CACHE_KEY } from '../src/lib/updates.js';

const fakeStore = fileURLToPath(new URL('./helpers/fakeWindowsStore.cjs', import.meta.url));
const releaseUrl = 'https://github.com/TechMitten/app-blips/releases/tag/v99.0.0';

async function launch(store) {
  const home = await mkdtemp(join(tmpdir(), 'appblips-update-'));
  await mkdir(join(home, '.config', 'appblips'), { recursive: true });
  await writeFile(join(home, '.config', 'appblips', 'settings.json'), JSON.stringify({ projectsRoot: join(home, 'Projects') }));
  // An existing provider file marks first-run onboarding as done.
  await writeFile(join(home, '.config', 'appblips', 'provider.json'), '{}');
  const app = await electron.launch({
    args: store ? ['-r', fakeStore, '.'] : ['.'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', HOME: home, XDG_CONFIG_HOME: join(home, '.config') },
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
  await page.getByRole('button', { name: 'Skip video' }).click({ timeout: 5000 }).catch(() => {});
  const close = async () => {
    await app.close();
    await rm(home, { recursive: true, force: true });
  };
  return { app, page, githubCalls, close };
}

async function storeInstall() {
  const { page, githubCalls, close } = await launch(true);
  try {
    const check = await page.evaluate(() => window.appblipsDesktop.updates.check());
    // Long enough for the startup check to have shown a notice if it were going to.
    await page.waitForTimeout(5000);
    const notices = await page.getByRole('status').filter({ hasText: /is available/ }).count();
    await page.screenshot({ path: join(tmpdir(), 'appblips-update-store.png') });
    return { check, notices, githubCalls: [...githubCalls] };
  } finally {
    await close();
  }
}

async function otherInstall() {
  const { app, page, close } = await launch(false);
  try {
    const notice = page.getByRole('status').filter({ hasText: 'AppBlips 99.0.0 is available' });
    await notice.waitFor({ timeout: 20000 });
    const check = await page.evaluate(() => window.appblipsDesktop.updates.check());
    const link = notice.getByRole('link');
    const result = { check, text: await notice.innerText(), label: await link.innerText(), href: await link.getAttribute('href') };
    await page.screenshot({ path: join(tmpdir(), 'appblips-update-other.png') });
    await link.click();
    await page.waitForTimeout(500);
    result.opened = await app.evaluate(() => globalThis.opened);
    return result;
  } finally {
    await close();
  }
}

const store = await storeInstall();
assert.equal(store.check.store, true, 'main reports a Store install');
assert.equal(store.notices, 0, 'a Store install shows no update notice');
assert.deepEqual(store.githubCalls, [], 'a Store install never asks GitHub');

const other = await otherInstall();
assert.ok(!other.check.store);
assert.equal(other.label, 'Download');
assert.equal(other.href, releaseUrl);
assert.doesNotMatch(other.text, /Microsoft Store/);
assert.deepEqual(other.opened, [releaseUrl], 'clicking opens the release');

console.log('ok: Store installs show no notice, other installs link to the release');
