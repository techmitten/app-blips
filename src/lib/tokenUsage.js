// Token counts reported by the AI provider, summed per chat turn and per chat
// session so the Build pane's header can show what the current chat has used.
// One turn makes many AI requests (routing, refinement turns, repairs, the
// closing reply, web searches through the provider), all recorded here:
// requestModelText tracks each chat request (trackRequest), and provider web
// searches report theirs (recordUsage).
//
// Providers only report counts when a request finishes, so while one is in
// flight its share is estimated (request size when sent, streamed text as it
// arrives) and swapped for the reported counts at the end. Requests the
// provider never reports on (a local server, or one stopped part-way, which is
// still billed) keep their estimate, counted apart in `estimated`, so the total
// is marked approximate.

// Totals of a turn or a chat. input includes cached input (cached = read
// from the provider's prompt cache at a discount, cacheWrite = written to it,
// at a surcharge on Claude); output includes any thinking.
export const emptyUsage = () => ({ input: 0, cached: 0, cacheWrite: 0, output: 0, estimated: 0, calls: 0, reported: 0 });
const USAGE_KEYS = Object.keys(emptyUsage());

const count = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

// Saved totals (a version's `usage`, a project's chat ledger) as a full
// totals object; older saves have only input/output/calls/reported.
export const normalizeTotals = (value) => {
  const totals = emptyUsage();
  if (!value || typeof value !== 'object') return totals;
  for (const key of USAGE_KEYS) totals[key] = count(value[key]);
  return totals;
};

export const addUsage = (a, b) => {
  const sum = normalizeTotals(a);
  const more = normalizeTotals(b);
  for (const key of USAGE_KEYS) sum[key] += more[key];
  return sum;
};

// A project's saved ledger, { [chatSessionId]: totals }, cleaned up.
export const normalizeChatUsage = (value) => {
  const ledger = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ledger;
  for (const [sessionId, totals] of Object.entries(value)) {
    if (typeof sessionId === 'string' && sessionId) ledger[sessionId] = normalizeTotals(totals);
  }
  return ledger;
};

// A chat session's totals from its versions' saved `usage`, for chats from
// before the project kept a ledger (App's chatUsage). Turns that failed or
// were cancelled left no version, so this can only fall short.
export const sessionUsageFromVersions = (versions, sessionId) => (Array.isArray(versions) ? versions : [])
  .filter((version) => version?.usage && version.sessionId === sessionId)
  .reduce((sum, version) => addUsage(sum, version.usage), emptyUsage());

export const usageTotal =(totals) => (totals ? totals.input + totals.output + totals.estimated : 0);

// The OpenAI-shaped `usage` every provider path returns (anthropic.js
// converts Claude's counts to it), as { input, cached, cacheWrite, output },
// or null when the provider sent none.
// - Cached input: prompt_tokens_details.cached_tokens (OpenAI, xAI, Gemini,
//   OpenRouter, Claude through anthropic.js) or prompt_cache_hit_tokens
//   (DeepSeek). It is already part of prompt_tokens everywhere.
// - Cache writes: prompt_tokens_details.cache_write_tokens (OpenRouter, Claude
//   through anthropic.js).
// - Output: OpenAI, DeepSeek and OpenRouter count thinking in
//   completion_tokens; Gemini and xAI leave it out and count it only in
//   total_tokens, so the larger of completion_tokens and total - prompt is used.
export const normalizeUsage = (usage) => {
  const prompt = Number(usage?.prompt_tokens);
  const completion = Number(usage?.completion_tokens);
  if (!Number.isFinite(prompt) && !Number.isFinite(completion)) return null;
  const input = count(prompt);
  const total = count(usage?.total_tokens);
  const output = Math.max(count(completion), total - input);
  const details = usage?.prompt_tokens_details;
  const cached = Math.min(input, count(details?.cached_tokens) || count(usage?.prompt_cache_hit_tokens));
  const cacheWrite = Math.min(input - cached, count(details?.cache_write_tokens));
  return { input, cached, cacheWrite, output };
};

// Roughly 4 characters per token for English text and code. Only used where
// the provider gives no counts.
const CHARS_PER_TOKEN = 4;
// An attached image is sent as a data URL; its base64 length says nothing
// about the tokens it costs. Counted as a flat, typical amount instead.
const IMAGE_TOKEN_ESTIMATE = 1000;

export const estimateRequestTokens = (body) => {
  let images = 0;
  const json = JSON.stringify(body, (key, value) => {
    if (typeof value === 'string' && value.startsWith('data:image/')) {
      images += 1;
      return '';
    }
    return value;
  }) || '';
  return Math.ceil(json.length / CHARS_PER_TOKEN) + images * IMAGE_TOKEN_ESTIMATE;
};

const activeMeters = new Set();
const liveRequests = new Set();
const requestEstimate = (request) => request.input + Math.ceil(request.outputChars / CHARS_PER_TOKEN);
// The meter the header follows: the latest one started.
let liveMeter = null;
// What the current chat used before the running turn (App sets it from the
// project's saved ledger), and the last finished turn, for the details.
let chatBase = emptyUsage();
let lastTurn = null;
// Which chat the base belongs to (its chat session id), and the chat each
// meter was started in: a turn only adds to the chat it ran in, even when the
// workspace changed under it (another project opened while it was stopping).
let chatKey = null;
const meterChat = new WeakMap();
let liveSnapshot = null;
const liveListeners = new Set();
let notifyTimer = null;

const takeSnapshot = () => {
  const totals = liveMeter ? addUsage(chatBase, liveMeter) : normalizeTotals(chatBase);
  let inFlight = 0;
  if (liveMeter) {
    for (const request of liveRequests) {
      if (request.meters.has(liveMeter)) inFlight += requestEstimate(request);
    }
  }
  totals.estimated += inFlight;
  return {
    ...totals,
    total: usageTotal(totals),
    running: Boolean(liveMeter),
    // Any part of the total is an estimate (requests still running, or never
    // reported).
    estimating: totals.estimated > 0,
    lastTurn: liveMeter ? normalizeTotals(liveMeter) : lastTurn,
  };
};

// Streams can deliver hundreds of chunks a second; the counter only needs a
// few updates a second.
const notifyLive = ({ now = false } = {}) => {
  const flush = () => {
    notifyTimer = null;
    liveSnapshot = takeSnapshot();
    for (const listener of liveListeners) listener();
  };
  if (now) {
    clearTimeout(notifyTimer);
    flush();
  } else if (!notifyTimer) {
    notifyTimer = setTimeout(flush, 150);
  }
};

// For useSyncExternalStore: the current chat's totals, including the turn
// that is running. Stable between updates.
export const subscribeLiveUsage = (listener) => {
  liveListeners.add(listener);
  return () => liveListeners.delete(listener);
};
export const getLiveUsage = () => liveSnapshot ?? (liveSnapshot = takeSnapshot());

// The current chat's totals before the running turn: the project's saved
// ledger entry for this chat session (App), or empty for a new chat. `key`
// names the chat; a different one forgets the last turn and lets go of a turn
// still running in the previous chat.
export const setChatUsageBase = (totals, key = null) => {
  const next = normalizeTotals(totals);
  const sameChat = key === chatKey;
  if (sameChat && USAGE_KEYS.every((name) => next[name] === chatBase[name])) return;
  chatBase = next;
  if (!sameChat) {
    chatKey = key;
    lastTurn = null;
    if (liveMeter && meterChat.get(liveMeter) !== key) liveMeter = null;
  }
  notifyLive({ now: true });
};

// Counts every request recorded until stop(). stop() can be called more than
// once (a build's version and its cleanup both call it) and returns the same
// totals each time. The first stop() of the running turn adds it to the chat
// base in the same update, so the header never dips between the two.
export const startUsageMeter = () => {
  const totals = emptyUsage();
  activeMeters.add(totals);
  meterChat.set(totals, chatKey);
  liveMeter = totals;
  notifyLive({ now: true });
  return {
    stop() {
      if (activeMeters.delete(totals) && liveMeter === totals && meterChat.get(totals) === chatKey) {
        liveMeter = null;
        chatBase = addUsage(chatBase, totals);
        lastTurn = normalizeTotals(totals);
        notifyLive({ now: true });
      }
      return normalizeTotals(totals);
    },
  };
};

const recordInto = (meters, counts, estimate) => {
  for (const totals of meters) {
    if (!activeMeters.has(totals)) continue;
    totals.calls += 1;
    if (!counts) {
      totals.estimated += estimate;
      continue;
    }
    totals.reported += 1;
    totals.input += counts.input;
    totals.cached += counts.cached;
    totals.cacheWrite += counts.cacheWrite;
    totals.output += counts.output;
  }
};

// Counts of a request made outside requestModelText (a web search through the
// AI provider, which runs the model with its search on). Recorded into the
// running meters as a finished request.
export const recordUsage = (usage) => {
  const counts = normalizeUsage(usage);
  if (!counts || !activeMeters.size) return;
  recordInto(activeMeters, counts, 0);
  notifyLive();
};

// One AI request, from send to finish. It counts toward the meters running
// when it was sent (and still running). finish(usage) records it with or
// without usage, so `calls` shows when some steps went unreported.
// cancel({ billed }) ends it without counts: dropped when the provider never
// accepted it (a refused or failed request), or kept as an estimate when it
// had started answering (stopped or cut off part-way), since that is billed.
export const trackRequest = (body) => {
  const request = { meters: new Set(activeMeters), input: estimateRequestTokens(body), outputChars: 0 };
  liveRequests.add(request);
  notifyLive();
  let open = true;
  const close = () => {
    if (!open) return false;
    open = false;
    liveRequests.delete(request);
    return true;
  };
  return {
    // Streamed text of any kind: reply, thinking, tool-call arguments.
    streamed(chars) {
      if (!open || !chars) return;
      request.outputChars += chars;
      notifyLive();
    },
    finish(usage) {
      if (!close()) return;
      recordInto(request.meters, normalizeUsage(usage), requestEstimate(request));
      notifyLive();
    },
    cancel({ billed = false } = {}) {
      if (!close()) return;
      if (billed) recordInto(request.meters, null, requestEstimate(request));
      notifyLive();
    },
  };
};

// 842, 12.4k, 1.2M
export const formatTokenCount = (n) => {
  const value = Math.max(0, Number(n) || 0);
  if (value < 1000) return String(Math.round(value));
  const [divisor, suffix] = value < 999_950 ? [1000, 'k'] : [1_000_000, 'M'];
  const scaled = value / divisor;
  return `${scaled < 100 ? scaled.toFixed(1).replace(/\.0$/, '') : Math.round(scaled)}${suffix}`;
};
