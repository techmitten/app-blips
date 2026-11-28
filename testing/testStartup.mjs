// Run with Vite running: node testing/testStartup.mjs
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const url = process.env.STARTUP_TEST_URL || 'http://127.0.0.1:5175';
const browser = await chromium.launch({ headless: true });
const project = {
  id: 'startup-project',
  name: 'Saved startup project',
  updatedAt: new Date().toISOString(),
  data: {
    studioMode: 'website',
    currentVersionIndex: 0,
    versions: [{ prompt: 'A saved site', files: { 'index.html': '<!doctype html><html><body>Saved site</body></html>' } }],
  },
};

try {
  for (const pendingProjectId of [project.id, null]) {
    const context = await browser.newContext();
    await context.addInitScript(({ project, pendingProjectId }) => {
      if (localStorage.getItem('startup-test-seeded')) return;
      localStorage.setItem('startup-test-seeded', 'true');
      localStorage.setItem('appblips-web-provider', JSON.stringify({ onboardingComplete: true }));
      localStorage.setItem('orion-projects', JSON.stringify([project]));
      localStorage.setItem('orion-current-project-id', project.id);
      localStorage.setItem('orion-pending-job', JSON.stringify({
        projectId: pendingProjectId, prompt: 'Interrupted startup build', studioMode: 'website',
      }));
    }, { project, pendingProjectId });

    let page = await context.newPage();
    await page.goto(url);
    await expect(page.locator('.hero-stage-first')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What should we build?' })).toBeVisible();
    assert.ok(await page.evaluate(() => localStorage.getItem('orion-pending-job')), 'Cold start preserves interrupted work');

    if (pendingProjectId) {
      await page.reload();
      await expect(page.getByRole('heading', { name: 'What should we build?' })).toBeVisible();
    }

    await page.getByRole('button', { name: 'Saved projects', exact: true }).click();
    await page.getByRole('button', { name: /^Saved startup project/ }).click();
    await expect(page.locator('.hero-stage-workspace')).toBeVisible();
    await expect(page.locator('#prompt')).toBeVisible();
    if (pendingProjectId) {
      await expect(page.getByText('Build interrupted', { exact: true }).first()).toBeVisible();
    } else {
      await expect(page.getByText('Build interrupted', { exact: true })).toHaveCount(0);
    }
    await page.reload();
    await expect(page.locator('#prompt')).toBeVisible();
    await expect(page.locator('.hero-stage-workspace')).toBeVisible();

    await page.close();
    page = await context.newPage();
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'What should we build?' })).toBeVisible();
    if (!pendingProjectId) {
      // A reload while a draft build was interrupted still recovers its studio.
      await page.evaluate(() => {
        localStorage.removeItem('orion-current-project-id');
        localStorage.removeItem('orion-start-fresh');
      });
      await page.reload();
      await expect(page.locator('#prompt')).toBeVisible();
      await expect(page.locator('.hero-crumbs-current')).toHaveText('Website Studio');
    }
    await context.close();
  }
  console.log('Startup checks passed: cold start on the home page, saved and draft jobs, reload recovery, and relaunch.');
} finally {
  await browser.close();
}
