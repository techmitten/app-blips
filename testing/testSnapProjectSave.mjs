// After npm run build && node scripts/build-electron.js:
// xvfb-run -a node testing/testSnapProjectSave.mjs
// Simulate snapd copying user data to revision 2 while settings still name 1.
import assert from 'node:assert/strict';
import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProjectStore } from '../electron/projectStore.js';

const project = (id, name) => ({ id, name, updatedAt: new Date().toISOString(), data: { versions: [{ files: { 'index.html': '<h1>Saved</h1>' } }], currentVersionIndex: 0 } });

for (const scenario of ['copied', 'empty', 'fresh']) {
  const existing = scenario === 'copied';
  const saved = scenario !== 'fresh';
  const home = await mkdtemp(join(tmpdir(), 'appblips-snap-save-'));
  const revision = join(home, 'snap', 'appblips', '2');
  const common = join(home, 'snap', 'appblips', 'common');
  const config = join(revision, '.config', 'appblips');
  const previous = join(home, 'snap', 'appblips', '1', '.config', 'appblips', 'Projects');
  const expected = saved ? join(config, 'Projects') : join(common, 'Projects');
  let app;
  try {
    await mkdir(config, { recursive: true });
    await writeFile(join(config, 'provider.json'), '{}');
    await writeFile(join(config, 'settings.json'), JSON.stringify(saved ? { projectsRoot: previous } : {}));
    if (existing) {
      const store = createProjectStore({ root: expected, orphanDir: join(config, 'app-data') });
      await store.save(project('1', 'Existing project'));
    }
    app = await electron.launch({
      args: ['.'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '', HOME: revision, XDG_CONFIG_HOME: join(revision, '.config'),
        SNAP: '/snap/appblips/2', SNAP_USER_DATA: revision, SNAP_USER_COMMON: common },
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    assert.equal(await page.evaluate(() => window.appblipsDesktop.folder.get()), expected);
    if (existing) {
      const { projects } = await page.evaluate(() => window.appblipsDesktop.projects.list());
      assert.ok(projects.some((p) => p.row.id === '1'), 'projects copied by snapd remain visible');
    }
    await page.evaluate((row) => window.appblipsDesktop.projects.save(row), project('2', 'University of Michigan'));
    assert.equal(JSON.parse(await readFile(join(expected, 'University of Michigan', 'project.json'), 'utf8')).id, '2');
    await expect.poll(async () => JSON.parse(await readFile(join(config, 'settings.json'), 'utf8')).projectsRoot).toBe(expected);
    assert.equal(existsSync(previous), false, 'never recreates or writes into the old revision');
  } finally {
    if (app) await app.close();
    await rm(home, { recursive: true, force: true });
  }
}
console.log('ok: Snap refresh preserves projects and saves to the active revision; new installs save to common');
