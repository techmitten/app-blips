// Run: node testing/testProjectNamePrompt.js
// The project name is a label, not a brief: it may be unrelated to what the
// user asked for, so the prompt must allow only titling/branding with it.
import assert from 'node:assert/strict';
import {
  buildInitialGenerationPrompt,
  buildWebsiteInitialGenerationPrompt,
  buildGameInitialGenerationPrompt,
  buildCreatePageInstruction,
  buildCreatePageParts,
} from '../src/lib/prompts.js';

const cases = [
  { name: 'Nebula Blaster', prompt: buildInitialGenerationPrompt('a recipe tracker', 'both', 'Nebula Blaster') },
  { name: 'Pixel Putt', prompt: buildWebsiteInitialGenerationPrompt('a bakery site', 'Pixel Putt') },
  { name: 'Sunrise Bakery', prompt: buildGameInitialGenerationPrompt('a platformer', 'Sunrise Bakery') },
  {
    name: 'Nebula Blaster',
    prompt: buildCreatePageInstruction({ pageName: 'about.html', request: 'a bakery site', landingHtml: '', projectName: 'Nebula Blaster' }),
  },
];

for (const { name, prompt } of cases) {
  assert.ok(prompt.includes(`is named "${name}"`), `names ${name}`);
  assert.match(prompt, /only a label/);
  assert.match(prompt, /do NOT infer its purpose, features, content/);
}

// Untitled/project-less builds stay as they were.
assert.doesNotMatch(buildInitialGenerationPrompt('a recipe tracker', 'both', ''), /only a label/);
assert.doesNotMatch(buildInitialGenerationPrompt('a recipe tracker', 'both', 'Untitled App'), /only a label/);
assert.doesNotMatch(buildWebsiteInitialGenerationPrompt('a bakery site', 'Untitled Website'), /only a label/);

// Page requests share everything but the final task line, so prompt caches
// can reuse the landing page from one page to the next.
const pageBase = { request: 'a bakery site', landingHtml: '<html></html>', projectName: 'Crumb' };
const aboutParts = buildCreatePageParts({ ...pageBase, pageName: 'about.html' });
const menuParts = buildCreatePageParts({ ...pageBase, pageName: 'menu.html' });
assert.equal(aboutParts.shared, menuParts.shared);
assert.ok(!menuParts.shared.includes('menu.html'));
assert.ok(menuParts.task.includes('menu.html'));

console.log('ok');
