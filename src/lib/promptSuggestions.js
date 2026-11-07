// Suggested next prompts (opt-in via Settings → AI → Suggested prompts).
// After a build, the AI proposes a few follow-up requests; they are stored on
// the version (`suggestions`) and shown as a row above the chat box. This file
// holds the framework-free parts so they can be tested with plain node; the
// request itself is generatePromptSuggestions in llm.js.

export const MAX_SUGGESTIONS = 4;
export const MAX_SUGGESTION_LENGTH = 120;

// How much of the project the model sees. Enough to know what exists, small
// enough that the extra request stays cheap next to the build itself.
const CODE_BUDGET = 6000;
const HISTORY_PROMPTS = 6;

// One line per page, plus the landing page's start and end (its head and the
// visible structure, then the scripts that hold the behaviour).
export function describeProjectForSuggestions(files = {}) {
  const pages = Object.keys(files);
  if (!pages.length) return '';
  const landing = files['index.html'] ?? files[pages[0]] ?? '';
  const code = landing.length > CODE_BUDGET
    ? `${landing.slice(0, CODE_BUDGET / 2)}\n...[truncated]...\n${landing.slice(-CODE_BUDGET / 2)}`
    : landing;
  const pageList = pages.length > 1 ? `Pages: ${pages.join(', ')}\n\n` : '';
  return `${pageList}Landing page code:\n${code}`;
}

// The user's earlier requests in this chat (most recent last), so the
// suggestions don't repeat what was already asked for.
export function recentRequests(chatHistory = [], max = HISTORY_PROMPTS) {
  return chatHistory
    .filter((m) => m?.role === 'user' && typeof m.content === 'string' && m.content.trim())
    .slice(-max)
    .map((m) => m.content.trim().replace(/\s+/g, ' ').slice(0, 300));
}

const cleanSuggestion = (value) => String(value ?? '')
  .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
  .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// The model is asked for a JSON array of strings. Not every model follows
// that exactly, so a JSON array anywhere in the reply is accepted, and failing
// that, one suggestion per non-empty line. Returns at most MAX_SUGGESTIONS
// distinct, non-empty strings; anything unusable gives [].
export function parseSuggestions(reply) {
  const text = String(reply ?? '').trim();
  if (!text) return [];
  let items = null;
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) items = parsed.filter((item) => typeof item === 'string');
    } catch {
      items = null;
    }
  }
  if (!items) items = text.replace(/```\w*/g, '').split('\n');
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const clean = cleanSuggestion(item);
    // A lead-in line ("Here are some ideas:") is not a suggestion.
    if (!clean || clean.length > MAX_SUGGESTION_LENGTH || clean.endsWith(':')) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}
