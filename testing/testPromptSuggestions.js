// Run: node testing/testPromptSuggestions.js
import assert from 'node:assert/strict';
import {
  parseSuggestions, recentRequests, describeProjectForSuggestions, MAX_SUGGESTIONS, MAX_SUGGESTION_LENGTH,
} from '../src/lib/promptSuggestions.js';

// A clean JSON array.
assert.deepEqual(parseSuggestions('["Add a dark mode toggle", "Show a high score"]'), ['Add a dark mode toggle', 'Show a high score']);

// JSON wrapped in a code fence and prose.
assert.deepEqual(
  parseSuggestions('Here you go:\n```json\n["Add sound effects", "Add a pause button"]\n```'),
  ['Add sound effects', 'Add a pause button'],
);

// No JSON: one per line, bullets, numbers, quotes and the lead-in line dropped.
assert.deepEqual(
  parseSuggestions('Here are some ideas:\n1. "Add a search box"\n- Add filters by category\n• Let users export to CSV'),
  ['Add a search box', 'Add filters by category', 'Let users export to CSV'],
);

// Duplicates (any case), empties, non-strings and over-long items are dropped; capped at MAX_SUGGESTIONS.
assert.deepEqual(
  parseSuggestions(JSON.stringify(['A', 'a', '', 42, 'x'.repeat(MAX_SUGGESTION_LENGTH + 1), 'B', 'C', 'D', 'E'])),
  ['A', 'B', 'C', 'D'],
);
assert.equal(parseSuggestions(JSON.stringify(['1', '2', '3', '4', '5', '6'])).length, MAX_SUGGESTIONS);

// Unusable replies give nothing.
assert.deepEqual(parseSuggestions(''), []);
assert.deepEqual(parseSuggestions(null), []);
assert.deepEqual(parseSuggestions('[]'), []);

// Only the user's text requests, most recent last, whitespace collapsed.
assert.deepEqual(
  recentRequests([
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'ok' },
    { role: 'user', content: [{ type: 'text', text: 'with image' }] },
    { role: 'user', content: '  second\n request ' },
  ]),
  ['first', 'second request'],
);
assert.equal(recentRequests(Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: `p${i}` })), 3).join(), 'p7,p8,p9');

// Project description: page list only for multi-page, long code clipped.
assert.equal(describeProjectForSuggestions({}), '');
assert.ok(!describeProjectForSuggestions({ 'index.html': '<p>hi</p>' }).includes('Pages:'));
const multi = describeProjectForSuggestions({ 'index.html': 'x'.repeat(20000), 'about.html': '' });
assert.ok(multi.startsWith('Pages: index.html, about.html'));
assert.ok(multi.includes('...[truncated]...'));
assert.ok(multi.length < 7000);

console.log('testPromptSuggestions: all passed');
