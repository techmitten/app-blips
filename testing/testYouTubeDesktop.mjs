// Run (Linux needs a display): npm run build && node scripts/build-electron.js
//   && env -u ELECTRON_RUN_AS_NODE xvfb-run -a node testing/testYouTubeDesktop.mjs
// YouTube in the real desktop app's preview. The player can't run in the
// sandboxed frame, so the bridge shows a poster in its place; the poster, a
// YouTube link and window.open to YouTube must all reach the main process as
// a plain youtube.com URL for the user's browser (shell.openExternal, recorded
// here instead of opening anything). No network or AI provider needed.
// HOME points at a temp folder, so real projects and settings are untouched.
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Videos</title></head><body>
<h1 id="title">Videos</h1>
<iframe id="embed" width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0" allow="autoplay; web-share" allowfullscreen></iframe>
<p><a id="watch" href="https://youtu.be/kJQP7kiw5Fk">Watch on YouTube</a></p>
<p><button id="open" onclick="window.open('https://www.youtube.com/watch?v=9bZkp7q19f0', '_blank')">Open video</button></p>
<div id="slot"></div>
<script>
  setTimeout(function () {
    var f = document.createElement('iframe');
    f.id = 'late'; f.width = 320; f.height = 180;
    f.src = 'https://www.youtube-nocookie.com/embed/2Vv-BfVoq4g?autoplay=1';
    document.getElementById('slot').appendChild(f);
  }, 300);
</script>
</body></html>`;

const home = await mkdtemp(join(tmpdir(), 'appblips-youtube-'));
const projectsRoot = join(home, 'Projects');
const configDir = join(home, '.config', 'appblips');
await mkdir(configDir, { recursive: true });
await writeFile(join(configDir, 'settings.json'), JSON.stringify({ projectsRoot }));
// An existing provider file marks first-run onboarding as done.
await writeFile(join(configDir, 'provider.json'), '{}');
await mkdir(join(projectsRoot, 'YouTube Test'), { recursive: true });
await writeFile(join(projectsRoot, 'YouTube Test', 'project.json'), JSON.stringify({
  id: '1700000000000',
  name: 'YouTube Test',
  updatedAt: new Date().toISOString(),
  data: {
    versions: [{ id: 1, prompt: 'videos', files: { 'index.html': PAGE }, timestamp: '12:00:00', editMode: 'full', reply: null, chatMode: 'build' }],
    currentVersionIndex: 0,
    chatContextStartIndex: 0,
    currentChatSessionId: null,
    studioMode: 'website',
  },
}));

const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '', HOME: home, XDG_CONFIG_HOME: join(home, '.config') },
});
try {
  await app.evaluate(({ shell }) => {
    globalThis.__opened = [];
    shell.openExternal = async (url) => { globalThis.__opened.push(url); };
  });
  const opened = () => app.evaluate(() => globalThis.__opened.slice());
  // Opens are paced one per second in main.js; wait out the gap each time.
  const expectOpened = async (count, url, what) => {
    for (let i = 0; i < 40 && (await opened()).length < count; i++) await new Promise((r) => setTimeout(r, 100));
    const list = await opened();
    assert.equal(list.length, count, `${what}: ${JSON.stringify(list)}`);
    assert.equal(list[count - 1], url, what);
    await new Promise((r) => setTimeout(r, 1100));
  };

  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: 'Skip video' }).click({ timeout: 5000 }).catch(() => {});
  await page.getByRole('button', { name: 'My projects' }).click({ timeout: 20000 });
  await page.getByText('YouTube Test').first().click();

  const frame = page.frameLocator('iframe[data-appblips-browser]');
  await frame.locator('#title').waitFor({ timeout: 30000 });

  // 1. A written-in player becomes the poster; clicking it opens the video.
  await frame.locator('#embed[data-ab-yt]').waitFor({ timeout: 5000 });
  const poster = frame.frameLocator('#embed').getByRole('button', { name: 'Watch on YouTube' });
  await poster.waitFor({ timeout: 5000 });
  await poster.click();
  await expectOpened(1, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'poster click');

  // 2. A youtu.be link.
  await frame.locator('#watch').click();
  await expectOpened(2, 'https://www.youtube.com/watch?v=kJQP7kiw5Fk', 'youtu.be link');

  // 3. window.open from the page's own script.
  await frame.locator('#open').click();
  await expectOpened(3, 'https://www.youtube.com/watch?v=9bZkp7q19f0', 'window.open');

  // 4. A player a script adds after load gets the poster too.
  await frame.locator('#late[data-ab-yt]').waitFor({ timeout: 5000 });
  await frame.frameLocator('#late').getByRole('button', { name: 'Watch on YouTube' }).click();
  await expectOpened(4, 'https://www.youtube.com/watch?v=2Vv-BfVoq4g', 'late poster click');

  // The stored page still has the real embed (the poster is preview-only).
  await page.waitForTimeout(500);
  const { readFile } = await import('node:fs/promises');
  const saved = JSON.parse(await readFile(join(projectsRoot, 'YouTube Test', 'project.json'), 'utf8'));
  const html = saved.data.versions[saved.data.currentVersionIndex].files['index.html'];
  assert.ok(html.includes('src="https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0"') && !html.includes('data-ab-yt'), 'stored page untouched');

  assert.deepEqual(errors, []);
  console.log('testYouTubeDesktop: ok');
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true });
}
