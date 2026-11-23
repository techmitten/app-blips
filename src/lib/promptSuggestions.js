// Suggested next prompts (opt-in via Settings → AI → Suggested prompts).
// After a build, the AI proposes a few follow-up requests; they are stored on
// the version (`suggestions`) and shown as a row above the chat box. This file
// holds the framework-free parts so they can be tested with plain node; the
// request itself is generatePromptSuggestions in llm.js.

export const MAX_SUGGESTIONS = 4;
export const MAX_SUGGESTION_LENGTH = 120;

// How much of the project the model sees, in characters. Enough to know what
// exists, small enough that the extra request stays cheap next to the build.
export const PROJECT_BUDGET = 3000;
// Below this, the outline says little (a game drawn on a canvas, an app whose
// screens are rendered by script), so the rest of the budget goes to the
// start of its main script.
const THIN_OUTLINE = 1500;
const ITEM_TEXT = 80;
const HISTORY_PROMPTS = 6;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };
const plainText = (html) => String(html)
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, name) => ENTITIES[name])
  .replace(/\s+/g, ' ')
  .trim();
const attr = (attrs, name) => (attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1] || '';

const inlineScripts = (html) => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attrs]) => !/\bsrc\s*=/i.test(attrs) && !/type\s*=\s*["']?(?:importmap|application\/(?:ld\+)?json)/i.test(attrs))
  .map(([, , code]) => code.trim())
  .filter(Boolean);

// What the page has, without its code: the title, sections, headings, buttons,
// links and form fields in page order, then the names of its script functions
// and the data it saves. It covers the whole page in a fraction of the size of
// its source, which is mostly styling setup, SVG paths and class lists.
export function outlinePage(html = '') {
  const source = String(html);
  const lines = [];
  const title = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title && plainText(title[1])) lines.push(`Title: ${plainText(title[1])}`);
  const scripts = inlineScripts(source);
  const markup = source
    .replace(/<head\b[\s\S]*?<\/head>/i, '')
    .replace(/<(script|style|svg|template)\b[\s\S]*?<\/\1>/gi, ' ');
  const seen = new Set();
  const add = (line) => {
    if (seen.has(line)) return;
    seen.add(line);
    lines.push(line);
  };
  const ITEM_RE = /<!--\s*@section:\s*([^>]*?)\s*-->|<(h[1-4]|button|a|label|canvas)\b([^>]*)>([\s\S]*?)<\/\2>|<(input|select|textarea)\b([^>]*)>/gi;
  for (const m of markup.matchAll(ITEM_RE)) {
    if (m[1]) {
      add(`Section: ${m[1]}`);
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const text = (plainText(m[4]) || attr(m[3], 'aria-label') || attr(m[3], 'title') || attr(m[3], 'id')).slice(0, ITEM_TEXT);
      if (tag === 'canvas') add('canvas (drawn by script)');
      else if (text) add(`${tag === 'a' ? 'link' : tag}: ${text}`);
    } else {
      const field = (attr(m[6], 'placeholder') || attr(m[6], 'aria-label') || attr(m[6], 'name') || attr(m[6], 'id')).slice(0, ITEM_TEXT);
      const type = m[5].toLowerCase() === 'input' ? attr(m[6], 'type') || 'text' : m[5].toLowerCase();
      if (field && type !== 'hidden') add(`field (${type}): ${field}`);
    }
  }
  const code = scripts.join('\n');
  const names = [...new Set([...code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^()]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)|\bclass\s+([A-Za-z_$][\w$]*)/g)]
    .map((m) => m[1] || m[2] || m[3]))];
  if (names.length) lines.push(`Script functions: ${names.join(', ')}`);
  const saved = [...new Set([...code.matchAll(/localStorage\.(?:getItem|setItem)\(\s*(['"`])([^'"`]+)\1/g)].map((m) => m[2]))];
  if (saved.length) lines.push(`Saved in the browser: ${saved.join(', ')}`);
  return lines.join('\n');
}

// The page list (multi-page sites), then an outline of the landing page. A
// thin outline is topped up with the start of the page's largest script.
// Everything stays within PROJECT_BUDGET.
export function describeProjectForSuggestions(files = {}) {
  const pages = Object.keys(files);
  if (!pages.length) return '';
  const landing = String(files['index.html'] ?? files[pages[0]] ?? '');
  const pageList = pages.length > 1 ? `Pages: ${pages.join(', ')}\n\n` : '';
  let outline = outlinePage(landing);
  if (outline.length > PROJECT_BUDGET) outline = `${outline.slice(0, PROJECT_BUDGET).replace(/\n[^\n]*$/, '')}\n...[outline truncated]`;
  let script = '';
  if (outline.length < THIN_OUTLINE) {
    const main = inlineScripts(landing).sort((a, b) => b.length - a.length)[0] || '';
    const room = PROJECT_BUDGET - outline.length;
    if (main) script = `\n\nStart of the main script:\n${main.length > room ? `${main.slice(0, room)}\n...[truncated]` : main}`;
  }
  return `${pageList}Landing page outline:\n${outline || '(nothing found)'}${script}`;
}

// What a build can and can't do, so suggestions stay within what AppBlips can
// actually deliver. It mirrors the build prompts in prompts.js: the generated
// project runs only in the visitor's browser, and a connected extension
// (getActiveConnectors(): [{ id, key }]) is the only way to reach past that.
// Pass only getActiveConnectors(): it holds just the extensions that are
// switched on and fully set up, so a suggestion never leans on one that
// merely exists in Settings.
// Keep it in step with those prompts and with buildConnectorDirective, which
// also leaves Web3Forms, tawk.to and Square out of games.
const STUDIO_LIMITS = {
  app: 'It is a single-page web app in one HTML file. It can use JavaScript libraries (charts, drag and drop, dates, maps and similar) and saves data only in the visitor\'s own browser, so data does not sync between devices or people.',
  website: 'It is a static, informational website: pages of text, images, navigation and layout, with light touches like animations, carousels, photo lightboxes, charts, FAQs and a map embed. New pages can be added. Websites do not get sign-ins, dashboards or app-like features.',
  game: 'It is a browser game in one HTML file, for one player or players sharing one device. Art is drawn in code (shapes, emoji, SVG) and sound is synthesized, so there are no music or sound files to add. It saves high scores and settings only in the player\'s own browser.',
};

export function describeBuildLimits(studioMode = 'app', connectors = []) {
  const ids = new Set((connectors || []).map(({ id }) => id));
  const game = studioMode === 'game';
  const sheets = ids.has('sheets');
  const pollinations = connectors?.find(({ id }) => id === 'pollinations');
  const puter = ids.has('puter');
  const aiFeatures = puter || (pollinations && pollinations.key !== 'none');
  const unlocked = [];
  if (sheets) {
    unlocked.push(game
      ? 'a shared online leaderboard (Google Sheets Backend)'
      : 'saving what visitors send, such as RSVPs, sign-ups, polls, votes and private messages to the owner, and showing counts and results (Google Sheets Backend). Visitors can only add entries and read them: no editing or deleting, and nothing visitors write that other visitors can read, such as comments, reviews, guestbooks or forums');
  }
  if (!game && ids.has('web3forms')) unlocked.push('contact and enquiry forms that really email the owner (Web3Forms)');
  if (!game && ids.has('square')) unlocked.push('buy, book or donate buttons that open the owner\'s Square payment links (no cart or checkout)');
  if (!game && ids.has('tawkto')) unlocked.push('a live chat widget (tawk.to)');
  if (pollinations) {
    unlocked.push(pollinations.key === 'none'
      ? 'AI-generated images (Pollinations)'
      : 'AI-generated images and AI features such as a chatbot or AI writing help (Pollinations)');
  }
  if (puter) {
    unlocked.push(game
      ? 'an AI opponent, narrator or helper, and saving progress to the player\'s own account (Puter)'
      : 'AI features such as a chatbot, AI writing help, an image generator or text to speech, and saving each visitor\'s own data and files to their account (Puter). Each visitor only sees their own saved data');
  }
  const formsLine = game
    ? ''
    : ids.has('web3forms') || sheets ? '' : ' Forms can check what is typed and show a thank-you message, but nothing is sent anywhere.';
  return [
    `WHAT APPBLIPS CAN BUILD: ${STUDIO_LIMITS[studioMode] || STUDIO_LIMITS.app}${formsLine}${game && pollinations ? ' Pollinations (below) can also make images for it.' : ''}`,
    `It runs entirely in the browser with no server of its own, so never suggest: user accounts or logins, data shared between visitors${sheets ? ' beyond what is listed below' : ''}, emails, texts or push notifications${ids.has('web3forms') && !game ? ' (other than the contact forms below)' : ''}, real payments or a checkout${ids.has('square') && !game ? ' (other than the Square links below)' : ''}, online multiplayer or chat between visitors, uploading files for others to see, connecting to outside services or APIs that need a key${aiFeatures ? '' : ', AI features such as a chatbot'}, a native phone or desktop app, or anything the user would have to do outside AppBlips (buying a domain, setting up hosting or accounts).`,
    unlocked.length ? `The user has also connected services that make these possible: ${unlocked.join('; ')}.` : '',
    `AppBlips has other optional extensions, but ${unlocked.length ? 'only the ones listed here are' : 'none are'} switched on. Never suggest anything that would need an extension or outside service that is not listed here as connected, and never suggest connecting, setting up or switching on one.`,
    'Only suggest what fits within this. When unsure whether something can be built, leave it out.',
  ].filter(Boolean).join('\n');
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
