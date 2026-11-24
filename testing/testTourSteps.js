// Run: node testing/testTourSteps.js
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildHomeTourSteps, buildTourSteps, HOME_TOUR_KEY, TOUR_KEY } from '../src/lib/tourSteps.js';

// Every anchor a step names must exist somewhere in the UI, or the step loses
// its spotlight (it falls back to the next anchor, and the last one is final).
// Rail keys (HeroSidebar's RailItem) take theirs as a `tour="..."` prop.
const anchors = new Set();
for (const dir of ['src', 'src/components']) {
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.jsx'))) {
    for (const [, id] of readFileSync(`${dir}/${name}`, 'utf8').matchAll(/\b(?:data-)?tour="([a-z-]+)"/g)) anchors.add(id);
  }
}

const text = (step) => [step.title, step.body, ...(step.tips || [])].join(' ');

// The two parts remember themselves separately; the build tour keeps the old
// single tour's key so people who finished it aren't asked again.
assert.equal(TOUR_KEY, 'appblips-tour-v2');
assert.notEqual(HOME_TOUR_KEY, TOUR_KEY);

// Home tour: the composer, studio switch, Build/Ask, then the rail (or, on
// narrow screens, one step for the whole menu).
for (const wideScreen of [true, false]) {
  const steps = buildHomeTourSteps({ wideScreen });
  const label = `home wide=${wideScreen}`;
  assert.deepEqual(steps.map((step) => step.id), wideScreen
    ? ['idea', 'studios', 'modes', 'start', 'finish']
    : ['idea', 'studios', 'modes', 'finish'], `${label}: steps`);
  for (const step of steps) {
    for (const target of step.target) assert.ok(anchors.has(target), `${label}: ${step.id} targets missing anchor "${target}"`);
    // Home steps never switch the workspace's Chat/Preview pane.
    assert.equal(step.view, undefined, `${label}: ${step.id} has no view`);
  }
  assert.match(steps.map(text).join(' '), /import/i, `${label}: mentions importing`);
  assert.match(text(steps.at(-1)), /second tour/, `${label}: points to the build tour`);
}

for (const studioMode of ['app', 'website', 'game', 'codebase']) {
  for (const wideScreen of [true, false]) {
    for (const hasCode of [true, false]) {
      for (const isForcedMobile of [false, true]) {
        const steps = buildTourSteps({ wideScreen, hasCode, showCodeView: true, studioMode, isForcedMobile });
        const label = `${studioMode} wide=${wideScreen} code=${hasCode} forcedMobile=${isForcedMobile}`;
        assert.equal(new Set(steps.map((step) => step.id)).size, steps.length, `${label}: unique ids`);
        // Moved to the home tour.
        for (const moved of ['idea', 'modes', 'apps']) assert.ok(!steps.some((step) => step.id === moved), `${label}: no ${moved} step`);
        assert.equal(steps[0].id, 'refine', `${label}: starts with refining`);
        assert.equal(steps.some((step) => step.id === 'devices'), !isForcedMobile, `${label}: devices step`);
        assert.equal(Boolean(steps.find((step) => step.id === 'chats')?.tips?.length), !wideScreen, `${label}: mobile new chat tip`);
        for (const step of steps) {
          for (const target of step.target) assert.ok(anchors.has(target), `${label}: ${step.id} targets missing anchor "${target}"`);
          // AI mode was removed from the composer; the tour must not offer it.
          assert.doesNotMatch(text(step), /\bAI builds\b|Build, Ask, or AI/, `${label}: ${step.id} mentions AI mode`);
        }
        const share = steps.find((step) => step.id === 'share');
        const download = steps.find((step) => step.id === 'download');
        // The download key has its own spotlit step in every studio.
        assert.ok(download, `${label}: download step`);
        assert.equal(download.target[0], 'download');
        if (studioMode === 'codebase') {
          // Imported sites have no Publish or Open key, and export a project zip.
          assert.ok(!share, `${label}: no Publish step`);
          assert.match(text(download), /\.zip/);
          assert.doesNotMatch(text(download), /Publish|Open in a new tab/);
          assert.match(text(steps.find((step) => step.id === 'preview')), /Files tab/);
        } else {
          assert.equal(share.target[0], 'publish');
          assert.match(text(share), /Publish/);
          // Left to right, as in the toolbar: download key, then Publish.
          assert.equal(steps.indexOf(download) + 1, steps.indexOf(share), `${label}: download before Publish`);
          assert.equal(/React project/.test(text(download)), studioMode === 'app', `${label}: React project choice`);
        }
        assert.equal(steps.some((step) => step.id === 'edit'), studioMode === 'website' && hasCode, `${label}: edit step`);
        // The settings tab was renamed Connectors -> Extensions.
        assert.match(text(steps.at(-1)), /Extensions/, `${label}: finish mentions Extensions`);
      }
    }
  }
}

console.log('tour steps ok');
