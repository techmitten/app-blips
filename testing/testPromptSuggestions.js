// Run: node testing/testPromptSuggestions.js
import assert from 'node:assert/strict';
import {
  parseSuggestions, recentRequests, describeProjectForSuggestions, describeBuildLimits, outlinePage, PROJECT_BUDGET, MAX_SUGGESTIONS, MAX_SUGGESTION_LENGTH,
} from '../src/lib/promptSuggestions.js';
import { getActiveConnectors } from '../src/lib/connectors.js';

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

// Project description: page list only for multi-page, then an outline of the landing page.
assert.equal(describeProjectForSuggestions({}), '');
assert.ok(!describeProjectForSuggestions({ 'index.html': '<p>hi</p>' }).includes('Pages:'));
assert.ok(describeProjectForSuggestions({ 'index.html': 'x'.repeat(20000), 'about.html': '' }).startsWith('Pages: index.html, about.html'));

// The outline keeps what the page has and drops head setup, styles, SVG paths and class lists.
const page = `<!doctype html><html><head><title>Plant &amp; Pot</title><script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = { theme: { extend: { colors: { leaf: '#0a0' } } } }</script><style>.x{color:red}</style></head>
<body class="bg-leaf text-white">
<!-- @section: hero -->
<h1 class="text-5xl">Grow <em>something</em></h1>
<a href="shop.html" class="btn">Shop plants</a>
<button aria-label="Open menu"><svg><path d="M0 0L10 10"/></svg></button>
<form><input type="email" placeholder="Your email"><input type="hidden" name="token"><textarea name="message"></textarea><button>Send</button></form>
<h2>FAQ</h2><h2>FAQ</h2>
<script type="application/ld+json">{"@type":"Store"}</script>
<script>function addToCart(id) {} const toggleMenu = () => {}; class Cart {} localStorage.setItem('plant-cart', '[]');</script>
</body></html>`;
const outline = outlinePage(page);
assert.equal(outline, [
  'Title: Plant & Pot',
  'Section: hero',
  'h1: Grow something',
  'link: Shop plants',
  'button: Open menu',
  'field (email): Your email',
  'field (textarea): message',
  'button: Send',
  'h2: FAQ',
  'Script functions: addToCart, toggleMenu, Cart',
  'Saved in the browser: plant-cart',
].join('\n'));
for (const noise of ['tailwind', 'color:red', 'M0 0', 'bg-leaf', 'Store', 'token']) assert.ok(!outline.includes(noise), noise);

// A page with plenty to outline gets no script; a long outline is cut to the budget at a line break.
const rich = describeProjectForSuggestions({ 'index.html': `<body>${Array.from({ length: 150 }, (_, i) => `<h2>Section heading number ${i}</h2>`).join('')}<script>function go() {}</script></body>` });
assert.ok(rich.startsWith('Landing page outline:\n'));
assert.ok(rich.endsWith('\n...[outline truncated]'));
assert.ok(!rich.includes('Start of the main script'));
assert.ok(rich.length <= PROJECT_BUDGET + 100);

// A thin outline (a canvas game) is topped up with the start of the largest inline script, within the budget.
const gameCode = `const SPEED = 4;\nfunction loop() {}\n${'// tuning\n'.repeat(1000)}`;
const game = describeProjectForSuggestions({ 'index.html': `<body><canvas id="c"></canvas><button>Start</button><script>const tiny = 1;</script><script type="module">${gameCode}</script></body>` });
assert.ok(game.includes('canvas (drawn by script)'));
assert.ok(game.includes('Start of the main script:\nconst SPEED = 4;'));
assert.ok(game.endsWith('...[truncated]'));
assert.ok(game.length <= PROJECT_BUDGET + 100);

// No markup at all still says so instead of sending nothing.
assert.equal(describeProjectForSuggestions({ 'index.html': '' }), 'Landing page outline:\n(nothing found)');

// Build limits: each studio gets its own scope, and the browser-only limits always apply.
const appLimits = describeBuildLimits('app');
assert.ok(appLimits.includes('single-page web app'));
assert.ok(appLimits.includes('logins'));
assert.ok(appLimits.includes('AI features such as a chatbot'));
assert.ok(appLimits.includes('nothing is sent anywhere'));
assert.ok(!appLimits.includes('connected services'));
assert.ok(describeBuildLimits('website').includes('static, informational website'));
assert.ok(describeBuildLimits('game').includes('synthesized'));
assert.ok(describeBuildLimits('unknown').includes('single-page web app'));

// Connected services widen the scope, and the never-suggest list makes room for them.
const connected = describeBuildLimits('website', [{ id: 'sheets', key: 'x' }, { id: 'web3forms', key: 'k' }, { id: 'square', key: 'l' }, { id: 'pollinations', key: 'visitors' }]);
assert.ok(connected.includes('Google Sheets Backend'));
assert.ok(connected.includes('comments, reviews, guestbooks'));
assert.ok(connected.includes('Web3Forms'));
assert.ok(connected.includes('Square payment links'));
assert.ok(connected.includes('chatbot or AI writing help'));
assert.ok(!connected.includes(', AI features such as a chatbot'));
assert.ok(!connected.includes('nothing is sent anywhere'));

// Pollinations without a key for AI features: images only.
const imagesOnly = describeBuildLimits('app', [{ id: 'pollinations', key: 'none' }]);
assert.ok(imagesOnly.includes('AI-generated images (Pollinations)'));
assert.ok(imagesOnly.includes(', AI features such as a chatbot'));

// Games leave out Web3Forms, tawk.to and Square (as buildConnectorDirective does); Sheets is a leaderboard.
const gameConnected = describeBuildLimits('game', [{ id: 'web3forms', key: 'k' }, { id: 'tawkto', key: 't' }, { id: 'square', key: 's' }, { id: 'sheets', key: 'x' }]);
assert.ok(!gameConnected.includes('Web3Forms'));
assert.ok(!gameConnected.includes('tawk.to'));
assert.ok(!gameConnected.includes('Square'));
assert.ok(gameConnected.includes('shared online leaderboard'));

// A game mentions images from a service only when Pollinations is connected.
assert.ok(!describeBuildLimits('game').includes('below'));
assert.ok(!gameConnected.includes('make images for it'));
const gameImages = describeBuildLimits('game', [{ id: 'pollinations', key: 'visitors' }]);
assert.ok(gameImages.includes('Pollinations (below) can also make images for it.'));
assert.ok(gameImages.includes('AI-generated images'));

// Every prompt forbids leaning on extensions that aren't switched on.
assert.ok(appLimits.includes('AppBlips has other optional extensions, but none are switched on.'));
assert.ok(appLimits.includes('never suggest connecting'));
assert.ok(connected.includes('only the ones listed here are switched on'));

// Only switched-on, fully set-up extensions reach the prompt: a disabled one
// with a valid key, or an enabled one with no setup, counts as not connected.
const active = getActiveConnectors({
  web3forms: { enabled: false, key: '12345678-1234-1234-1234-123456789012' },
  square: { enabled: false, key: 'https://square.link/u/abc123' },
  sheets: { enabled: true, key: '' },
  tawkto: { enabled: true, key: '' },
});
assert.deepEqual(active, []);
const offLimits = describeBuildLimits('website', active);
for (const name of ['Web3Forms', 'Square', 'Google Sheets Backend', 'tawk.to', 'Pollinations']) {
  assert.ok(!offLimits.includes(name), `${name} must not be offered when it isn't switched on`);
}
const onlySquare = describeBuildLimits('website', getActiveConnectors({ square: { enabled: true, key: 'https://square.link/u/abc123' } }));
assert.ok(onlySquare.includes('Square payment links'));
assert.ok(!onlySquare.includes('Web3Forms'));

console.log('testPromptSuggestions: all passed');
