import assert from 'node:assert/strict';
import { test } from 'node:test';

const project = id => ({ id, versions: [{}] });

test('asks after three distinct saved projects and remembers dismissal across reloads', async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const prompt = await import('../src/lib/githubStarPrompt.js?lifecycle');
  assert.equal(prompt.trackStarPromptProjects([{ id: 'empty', versions: [] }]), false);
  assert.equal(prompt.trackStarPromptProjects([project('one')]), false);
  assert.equal(prompt.trackStarPromptProjects([project('one')]), false, 'autosaves do not count twice');
  assert.equal(prompt.trackStarPromptProjects([project('two')]), false, 'deleted projects still count');
  const reloaded = await import('../src/lib/githubStarPrompt.js?reload');
  assert.equal(reloaded.trackStarPromptProjects([project('three')]), true);
  reloaded.dismissStarPrompt();
  const dismissed = await import('../src/lib/githubStarPrompt.js?dismissed');
  assert.equal(dismissed.trackStarPromptProjects([project('four')]), false);
});

test('existing project summaries count, and corrupt or unavailable storage does not break the app', async () => {
  globalThis.localStorage = {
    getItem: () => '{broken',
    setItem: () => { throw new Error('Storage unavailable'); },
  };
  const prompt = await import('../src/lib/githubStarPrompt.js?unavailable');
  assert.equal(prompt.trackStarPromptProjects([{ id: 'one', versionCount: 1 }, project('two'), project('three')]), true);
  prompt.dismissStarPrompt();
  assert.equal(prompt.trackStarPromptProjects([project('four')]), false);
});
