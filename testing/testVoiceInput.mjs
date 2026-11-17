// Headless-browser test for voice input on the hero: Chromium's fake
// microphone plays a speech clip, the mic button records it, and the Whisper
// model (src/lib/whisperWorker.js) must transcribe it into the prompt. The
// first click asks before downloading: "Not now" downloads nothing, and
// "Download" fetches Hugging Face's pinned revision (nothing else leaves the
// app) without opening the mic. After a reload, voice input must start
// straight away from the kept copy. Needs an internet connection.
//
//   npx playwright install chromium   # once
//   npm run build
//   node testing/testVoiceInput.mjs
//
// Starts server.js on a spare port to serve dist/. The clip is President
// Kennedy's 1961 inaugural line (public domain), 16 kHz mono.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const clip = fileURLToPath(new URL('./fixtures/voice-jfk.wav', import.meta.url));
const port = 3000 + Math.floor(Math.random() * 1000) + 1000;
const origin = `http://127.0.0.1:${port}`;

const server = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.on('exit', (code) => reject(new Error(`server.js exited with ${code}`)));
  server.stdout.on('data', (chunk) => {
    if (String(chunk).includes(String(port))) resolve();
  });
});

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${clip}`,
  ],
});

try {
  const context = await browser.newContext({ permissions: ['microphone'] });
  await context.addInitScript(() => {
    localStorage.setItem('appblips-web-provider', JSON.stringify({ onboardingComplete: true }));
    localStorage.setItem('orion-splash-last-shown', String(Date.now()));
  });
  const offsite = [];
  context.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) offsite.push(url);
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  const openHero = async () => {
    await page.goto(origin);
    const skip = page.getByRole('button', { name: 'Skip video' });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await page.getByRole('button', { name: /Mobile & Web App/ }).click();
    await expect(page.getByRole('button', { name: 'Start voice input' })).toBeVisible();
  };

  const recordOnce = async () => {
    await page.getByRole('button', { name: 'Start voice input' }).click();
    await expect(page.getByText('Listening…')).toBeVisible();
    // The clip is 11 s; the fake device loops it, so record all of it once.
    await page.waitForTimeout(11500);
    await page.getByRole('button', { name: 'Stop voice input' }).click();
    await expect(page.getByText('Transcribing…')).toBeVisible();
    await expect(page.locator('#prompt')).toHaveValue(/what your country can do for you/i, { timeout: 120_000 });
    await expect(page.getByText('Transcribing…')).toHaveCount(0);
    console.log('Transcript:', await page.locator('#prompt').inputValue());
  };

  const isVoiceRequest = (url) => /huggingface|hf\.co|jsdelivr|onnx|whisper|\.wasm/i.test(url);
  const PINNED = 'https://huggingface.co/onnx-community/whisper-base/resolve/1846881b6b3a3024392c1eea3ad983695bc23925/';
  const fromHuggingFace = (url) => /^https:\/\/([a-z0-9-]+\.)*(huggingface\.co|hf\.co)\//.test(url);

  await openHero();
  // First click: asks, and "Not now" downloads nothing and leaves the mic closed.
  await page.getByRole('button', { name: 'Start voice input' }).click();
  await expect(page.getByText('Download the voice model?')).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByText('Download the voice model?')).toHaveCount(0);
  await page.waitForTimeout(1000);
  assert.deepEqual(offsite.filter(isVoiceRequest), [], '"Not now" downloads nothing');
  await expect(page.getByText('Listening…')).toHaveCount(0);

  // "Download": progress shows, the mic stays closed, then voice input is ready.
  await page.getByRole('button', { name: 'Start voice input' }).click();
  // VOICE_SCREENSHOT=path.png saves the question, to check how it looks.
  if (process.env.VOICE_SCREENSHOT) {
    await page.waitForTimeout(800); // past the dialog's entrance animation
    await page.screenshot({ path: process.env.VOICE_SCREENSHOT });
  }
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText(/Downloading voice model… \d+%|Preparing voice input…/)).toBeVisible();
  await expect(page.getByText('Listening…')).toHaveCount(0);
  await expect(page.getByText('Voice input is ready. Click the microphone to speak.')).toBeVisible({ timeout: 300_000 });

  // The UI's own fonts etc. may come from elsewhere; voice input only from
  // the pinned model revision on Hugging Face (and the CDN it redirects to).
  const firstRun = offsite.filter(isVoiceRequest);
  assert.ok(firstRun.some((url) => url.startsWith(PINNED)), 'The download fetched the pinned model');
  assert.deepEqual(firstRun.filter((url) => !fromHuggingFace(url)), [], 'Voice input fetched only from Hugging Face');
  // Hugging Face redirects some files to other addresses that still name the revision.
  const REVISION = PINNED.split('/').at(-2);
  assert.deepEqual(firstRun.filter((url) => /huggingface\.co\//.test(url) && !url.includes(REVISION)), [], 'Only the pinned revision');
  await recordOnce();

  // A new session starts voice input straight away from the kept model.
  offsite.length = 0;
  await openHero();
  await page.locator('#prompt').fill('');
  await recordOnce();
  await expect(page.getByText('Download the voice model?')).toHaveCount(0);
  assert.deepEqual(offsite.filter(isVoiceRequest), [], 'The second session used the kept model');

  assert.deepEqual(consoleErrors.filter((text) => /whisper|onnx|voice/i.test(text)), [], 'No voice-input errors in the console');
  console.log('ok testVoiceInput');
} finally {
  await browser.close();
  server.kill();
}
