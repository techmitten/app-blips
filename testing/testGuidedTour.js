// Run against the local dev server: TOUR_TEST_URL=http://127.0.0.1:5175 node testing/testGuidedTour.js
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const url = process.env.TOUR_TEST_URL || 'http://127.0.0.1:5175';
const viewports = [
  { width: 1440, height: 900, hasTouch: false },
  { width: 768, height: 1024, hasTouch: false },
  { width: 390, height: 844, hasTouch: true },
  { width: 667, height: 375, hasTouch: true },
];

async function waitAnimations(locator) {
  await locator.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.hasTouch });
    const page = await context.newPage();
    await page.addInitScript(() => {
      if (window !== window.top) return;
      localStorage.setItem('orion-skip-splash', 'true');
      localStorage.setItem('orion-show-code-view', 'true');
      localStorage.setItem('orion-legal-agreement', JSON.stringify({ terms: '2099-01-01', privacy: '2099-01-01', agreedAt: new Date().toISOString() }));
      localStorage.setItem('appblips-web-provider', JSON.stringify({ enabled: false, onboardingComplete: true }));
      const code = '<!doctype html><html><body><h1>Tour fixture</h1></body></html>';
      localStorage.setItem('orion-projects', JSON.stringify([{ id: 'tour-fixture', name: 'Tour fixture', studioMode: 'app', updatedAt: new Date().toISOString(), data: { versions: [{ id: '1', code, prompt: 'hi', reply: 'ok', timestamp: '12:00', chatSessionId: 's1' }], currentVersionIndex: 0 } }]));
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('button[data-studio="app"]').click();
    if (viewport.width < 1024) {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await page.locator('#hero-mobile-menu').getByRole('button', { name: /^Projects/ }).click();
    } else {
      await page.locator('.hero-rail [data-tour="apps"]').click();
    }
    await page.locator('.modal-card').getByRole('button', { name: /Tour fixture/ }).first().click();

    await page.locator('#prompt').fill('Keep my draft unchanged');
    const invite = page.locator('.tour-invite');
    await invite.waitFor();
    await waitAnimations(invite);

    // On narrow/tablet layouts the invitation toast must sit above the composer, not overlap it.
    if (viewport.width < 1024) {
      const inviteBox = await invite.boundingBox();
      const composerBox = await page.locator('.build-panel-composer').boundingBox();
      assert.ok(inviteBox.y + inviteBox.height <= composerBox.y + 1, `Tour invitation clears composer at ${viewport.width}x${viewport.height}: invite=${JSON.stringify(inviteBox)} composer=${JSON.stringify(composerBox)}`);
    }

    await page.getByRole('button', { name: 'Start tour', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Describe what you want', exact: true });
    await dialog.waitFor();
    await page.waitForFunction(() => document.activeElement?.classList.contains('tour-card'));
    assert.equal(await page.locator('#root').evaluate((el) => el.inert), true);

    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Next');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Close tour');

    const totalSteps = await page.locator('.tour-dot').count();
    const expectedSteps = viewport.hasTouch ? 8 : viewport.width >= 1024 ? 10 : 9;
    assert.equal(totalSteps, expectedSteps, `Expected ${expectedSteps} steps at ${viewport.width}x${viewport.height}`);

    for (let index = 0; index < totalSteps; index++) {
      const card = page.locator('.tour-card');
      await page.getByText(`Step ${index + 1} of ${totalSteps}`, { exact: true }).waitFor();
      await page.locator('.tour-spotlight').waitFor();
      await waitAnimations(card);
      const box = await card.boundingBox();
      assert.ok(
        box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
        `Card fits ${viewport.width}x${viewport.height} at step ${index + 1}: ${JSON.stringify(box)}`,
      );
      assert.equal(await page.locator('.tour-spotlight-empty').count(), 0, `Step ${index + 1} has a visible spotlight at ${viewport.width}x${viewport.height}`);
      await card.getByRole('button', { name: index === totalSteps - 1 ? 'Finish' : 'Next', exact: true }).click();
    }

    await page.locator('.tour-card').waitFor({ state: 'detached' });
    assert.equal(await page.locator('#root').evaluate((el) => el.inert), false);
    assert.equal(await page.locator('#prompt').inputValue(), 'Keep my draft unchanged');
    assert.equal(await page.locator('#prompt').isVisible(), true);

    // Relaunch from the sidebar (desktop) or mobile drawer, jump steps, and close with Escape.
    if (viewport.width < 1024) {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await page.locator('#hero-mobile-menu').getByRole('button', { name: 'Take the tour', exact: true }).click();
    } else {
      await page.locator('.hero-rail [data-tour="tour"]').click();
    }
    await page.locator('.tour-card').waitFor();
    if (viewport.width >= 1024) {
      // Moving off the hover-peeking rail collapses it after a short delay; the spotlight must stay on its anchor.
      await page.mouse.move(viewport.width / 2, viewport.height / 2);
      await page.locator('.hero-rail.lg\\:w-15').waitFor();
      await waitAnimations(page.locator('.hero-rail'));
      await page.locator('.tour-spotlight:not(.tour-spotlight-empty)').waitFor();
      await waitAnimations(page.locator('.tour-spotlight'));
      const spotlightBox = await page.locator('.tour-spotlight').boundingBox();
      const promptBox = await page.locator('[data-tour="prompt"]').boundingBox();
      assert.ok(
        Math.abs((spotlightBox.x + 6) - promptBox.x) <= 2 && Math.abs((spotlightBox.width - 12) - promptBox.width) <= 2,
        `Spotlight stayed aligned after rail collapse: spotlight=${JSON.stringify(spotlightBox)} prompt=${JSON.stringify(promptBox)}`,
      );
    }
    const jumpStep = viewport.hasTouch ? 4 : 5;
    await page.getByRole('button', { name: `Go to step ${jumpStep}: Every change is a version` }).click();
    await page.getByText(`Step ${jumpStep} of ${totalSteps}`, { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByText(`Step ${jumpStep - 1} of ${totalSteps}`, { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.tour-card').waitFor({ state: 'detached' });

    if (viewport.width < 1024) {
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-tour')), 'menu');
    } else {
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-tour')), 'tour');
    }

    await page.reload({ waitUntil: 'networkidle' });
    const studioBtn = page.locator('button[data-studio="app"]');
    if (await studioBtn.isVisible().catch(() => false)) {
      await studioBtn.click();
    }
    await page.locator('#prompt').waitFor();
    if (!(await page.locator('.hero-rail [data-tour="tour"], [data-tour="menu"]').first().isVisible().catch(() => false)) || (await page.locator('.hero-rail [data-tour="tour"]').count()) === 0) {
      if (viewport.width < 1024) {
        await page.getByRole('button', { name: 'Open menu', exact: true }).click();
        await page.locator('#hero-mobile-menu').getByRole('button', { name: /^Projects/ }).click();
      } else {
        await page.locator('.hero-rail [data-tour="apps"]').click();
      }
      await page.locator('.modal-card').getByRole('button', { name: /Tour fixture/ }).first().click();
      await page.locator('#prompt').waitFor();
    }
    assert.equal(await page.locator('.tour-invite').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`Tour passed at ${viewport.width} × ${viewport.height}`);
    await context.close();
  }
} finally {
  await browser.close();
}
