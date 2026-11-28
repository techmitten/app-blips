// LLM providers the proxies can talk to. Users choose Anthropic, OpenAI,
// Gemini, xAI, DeepSeek or OpenRouter in Settings → AI.

const PROVIDERS = {
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    reasoningParam: 'reasoning_effort',
  },
  // Not OpenAI-compatible: chatProxy.js sends its requests through the
  // official SDK (anthropic.js), which translates to and from this shape.
  // Current Claude models reject forced tool choices.
  anthropic: {
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    reasoningParam: 'reasoning_effort',
    forcedToolChoice: false,
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    reasoningParam: 'reasoning_effort',
  },
  gemini: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    reasoningParam: 'reasoning_effort',
  },
  // Grok. OpenAI-compatible at api.x.ai/v1, with /models; keys start xai-.
  xai: {
    label: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    reasoningParam: 'reasoning_effort',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    reasoningParam: 'reasoning_effort',
  },
};

import { staticReasoningLevels, nearestLevel } from './reasoning.js';

const PRESET_DEFAULTS = { forcedToolChoice: true, streamUsage: true };

const OFF_EFFORTS = new Set([false, 'none', 'off', 'disabled', '']);

// Output limit for building, editing, repairs and reviews when Settings → AI
// has none. Without one, providers apply their own default, which can be a
// few thousand tokens: a whole app then stops halfway and no search/replace
// repair can bring back the missing half. Current hosted models allow at
// least this much; a provider that rejects it gets the request again with the
// largest limit its error allows (chatProxy.js). Ask mode keeps the provider
// default, except on Anthropic, which requires a limit.
export const DEFAULT_BUILD_MAX_TOKENS = 64000;

// The first entry is the default in onboarding and Settings.
export const USER_PROVIDER_IDS = ['anthropic', 'openai', 'gemini', 'xai', 'deepseek', 'openrouter'];
export const USER_PROVIDER_OPTIONS = USER_PROVIDER_IDS.map((id) => ({
  id,
  label: PROVIDERS[id].label,
  baseUrl: PROVIDERS[id].baseUrl,
  models: [],
}));
export const providerLabel = (id) => PROVIDERS[id]?.label || id;

// OpenRouter lists models sold as uncensored (Venice's "Uncensored", the
// "abliterated" fine-tunes that have their refusals stripped out). AppBlips
// doesn't offer them: they're hidden from the model list and refused if typed
// in by hand. Matched on the model's id and name only; descriptions mention
// other models and words like "uncensored" in passing.
const UNCENSORED_MODEL = /uncensor|venice|abliterat/i;
export const isUncensoredModel = (...names) => names.some((name) => typeof name === 'string' && UNCENSORED_MODEL.test(name));
// OpenRouter as a preset, or any provider pointed at its endpoint.
export const isOpenRouter = (provider) => {
  if (provider?.id === 'openrouter') return true;
  try { return /(^|\.)openrouter\.ai$/i.test(new URL(provider?.baseUrl).hostname); } catch { return false; }
};
export const UNCENSORED_ERROR = 'Uncensored models are not available in AppBlips. Choose a different model.';

const MAX_USER_KEY_LENGTH = 512;
const MAX_USER_MODEL_LENGTH = 200;

// Builds a provider from user-supplied settings (the request's
// `user_provider` field): { id, apiKey, model, baseUrl, reasoningParam,
// forcedToolChoice, streamUsage }, or { error }.
export const resolveUserProvider = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Invalid provider settings.' };
  const id = typeof input.id === 'string' ? input.id.trim().toLowerCase() : '';
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  const model = typeof input.model === 'string' ? input.model.trim() : '';
  if (!USER_PROVIDER_IDS.includes(id)) return { error: `Choose one of: ${USER_PROVIDER_OPTIONS.map((p) => p.label).join(', ')}.` };
  if (!apiKey) return { error: 'The API key is empty.' };
  // eslint-disable-next-line no-control-regex
  if (apiKey.length > MAX_USER_KEY_LENGTH || /[\s\x00-\x1f\x7f]/.test(apiKey)) return { error: 'The API key is not valid.' };
  if (!model) return { error: 'The model is empty.' };
  // eslint-disable-next-line no-control-regex
  if (model.length > MAX_USER_MODEL_LENGTH || /[\x00-\x1f\x7f]/.test(model)) return { error: 'The model name is not valid.' };
  const allowedModels = USER_PROVIDER_OPTIONS.find((option) => option.id === id)?.models || [];
  if (allowedModels.length && !allowedModels.some((option) => option.id === model)) {
    return { error: `Choose one of the supported ${providerLabel(id)} models.` };
  }
  if (id === 'openrouter' && isUncensoredModel(model)) return { error: UNCENSORED_ERROR };
  const preset = PROVIDERS[id];
  return {
    id,
    ...PRESET_DEFAULTS,
    ...preset,
    apiKey,
    model,
    baseUrl: preset.baseUrl,
    reasoningParam: preset.reasoningParam,
  };
};

// Prompt caching. Every provider caches a request start it has seen before;
// they differ in what they need to be told.
// - Anthropic: caches only up to a marked cache point (cache_control). The
//   renderer marks one on a text part (llm.js createPageContent);
//   anthropic.js passes it on and adds its own.
// - OpenRouter with a Claude model: the same markers, sent in OpenRouter's
//   format, with the cache points anthropic.js would add (system prompt, end
//   of a tool conversation). Other models there get the plain string.
// - OpenRouter: picks a backend by hashing the first messages, which differ
//   per page of a build, so a page request could land where nothing is
//   cached. session_id pins one request series to one backend.
// - OpenAI: prompt_cache_key does the same for its own servers.
// - Everyone else caches automatically and gets the plain string, since not
//   every provider accepts the field or text-part arrays.
// `cacheKey` is the renderer's per-message ID (x-appblips-message): random,
// shared by every request of one build, and naming nothing about the user.
const CACHE_POINT = { type: 'ephemeral' };
const OPENROUTER_CLAUDE = /^~?anthropic\//i;
const MAX_CACHE_KEY_LENGTH = 64;

const withoutCachePoints = (messages) => messages.map((message) => {
  const parts = message?.content;
  if (!Array.isArray(parts) || !parts.some((part) => part?.cache_control)) return message;
  if (parts.every((part) => part?.type === 'text')) return { ...message, content: parts.map((part) => part.text).join('') };
  return {
    ...message,
    content: parts.map((part) => {
      const { cache_control: _drop, ...rest } = part; // eslint-disable-line no-unused-vars
      return rest;
    }),
  };
});

// The system prompt as a text part marked as a cache point, as anthropic.js
// does for direct Claude requests.
const withCachedSystemPrompt = (messages) => {
  const index = messages.findIndex((message) => message?.role === 'system');
  const content = messages[index]?.content;
  if (index < 0 || typeof content !== 'string' || !content.trim()) return messages;
  const next = [...messages];
  next[index] = { ...messages[index], content: [{ type: 'text', text: content, cache_control: CACHE_POINT }] };
  return next;
};

const applyCacheSettings = (bodyObj, provider, cacheKey) => {
  if (provider.id === 'anthropic' || !Array.isArray(bodyObj.messages)) return;
  const key = typeof cacheKey === 'string' && /^[\w-]+$/.test(cacheKey) ? cacheKey.slice(0, MAX_CACHE_KEY_LENGTH) : '';
  if (isOpenRouter(provider)) {
    if (key) bodyObj.session_id = key;
    if (OPENROUTER_CLAUDE.test(String(bodyObj.model || ''))) {
      bodyObj.messages = withCachedSystemPrompt(bodyObj.messages);
      // As in anthropic.js: tool loops resend the whole conversation each
      // turn, so a cache point at its end lets each turn read the one before.
      if (Array.isArray(bodyObj.tools) && bodyObj.tools.length) bodyObj.cache_control = CACHE_POINT;
      return;
    }
  } else if (provider.id === 'openai' && key && isOpenAIEndpoint(provider)) {
    bodyObj.prompt_cache_key = key;
  }
  bodyObj.messages = withoutCachePoints(bodyObj.messages);
};

const isOpenAIEndpoint = (provider) => {
  try { return new URL(provider?.baseUrl).hostname === 'api.openai.com'; } catch { return false; }
};

// Adapts an OpenAI-style request body in place to what `provider` accepts:
// writes the reasoning setting, drops stream_options where unsupported,
// relaxes forced tool choices where unsupported (including DeepSeek with
// thinking on), and sets up prompt caching (applyCacheSettings above).
// Returns { reasoningEnabled }.
export const applyProviderSettings = (bodyObj, provider, { effort, cacheKey } = {}) => {
  applyCacheSettings(bodyObj, provider, cacheKey);
  let raw = effort ?? 'none';
  let off = OFF_EFFORTS.has(raw);
  if (off) raw = 'none';

  // Settings → AI only offers the levels the model accepts (reasoning.js) and
  // the renderer clamps to them. This repeats that for levels the model is
  // known to reject (e.g. Extra high on Opus 4.6, Off on Gemini 3), using
  // the static rules only: unrecognised models get the level as asked.
  // Chat-only calls ask for Off; a model that can't turn reasoning off gets
  // its lowest level instead of its (often high) default.
  const model = bodyObj.model || provider.model;
  const rules = staticReasoningLevels(provider.id, model);
  if (rules.known && rules.levels.length && !['anthropic', 'deepseek'].includes(provider.id)) {
    raw = nearestLevel(raw, rules.levels);
    off = raw === 'none';
  }

  if (provider.id === 'openai') {
    // Modern OpenAI models require max_completion_tokens. Reasoning effort
    // only applies to reasoning models; older GPT models reject it.
    if (bodyObj.max_tokens != null) {
      bodyObj.max_completion_tokens = bodyObj.max_tokens;
      delete bodyObj.max_tokens;
    }
    if (rules.levels.length) {
      // 'none' is sent when the model accepts it (GPT-5.1 and later);
      // otherwise Off was already clamped to the model's lowest level.
      // An unrecognised model gets no effort on Off, keeping its default.
      if (!off || rules.levels.includes('none')) bodyObj.reasoning_effort = raw;
      // Sampling parameters are unsupported by many reasoning models.
      delete bodyObj.temperature;
    } else {
      delete bodyObj.reasoning_effort;
    }
  } else if (provider.id === 'deepseek') {
    // DeepSeek maps the in-between levels itself (medium and xhigh → high).
    bodyObj.thinking = { type: off ? 'disabled' : 'enabled' };
    if (!off) bodyObj.reasoning_effort = raw;
  } else if (provider.id === 'anthropic') {
    // anthropic.js maps this to Claude's effort and thinking settings;
    // absent means reasoning off.
    if (!off) {
      const known = staticReasoningLevels('anthropic', model);
      bodyObj.reasoning_effort = known.levels.length ? nearestLevel(raw, known.levels.filter((level) => level !== 'none')) : raw;
    }
  } else if (provider.id === 'gemini') {
    // Off is only accepted by Gemini 2.5 Flash / Flash-Lite (clamped above);
    // elsewhere it is omitted, which keeps the model's default.
    if (!off || rules.levels.includes('none')) bodyObj.reasoning_effort = raw;
  } else if (provider.id === 'xai') {
    // Only Grok models known to take reasoning_effort get it (reasoning.js);
    // others reject the parameter, and omitting it keeps their default.
    if (!off && rules.known && rules.levels.length) bodyObj.reasoning_effort = raw;
    else delete bodyObj.reasoning_effort;
  } else if (provider.id === 'openrouter' && !off) {
    // Omit it when reasoning is off: some always-thinking models reject an
    // explicit "none", while omission uses the model default.
    bodyObj.reasoning_effort = raw;
  }

  if (provider.streamUsage === false) delete bodyObj.stream_options;
  // DeepSeek supports thinking + tools, but thinking rejects "required"
  // and named choices. Keep thinking enabled and retain the offered tools.
  const cannotForceTools = provider.forcedToolChoice === false || (provider.id === 'deepseek' && !off);
  if (cannotForceTools && bodyObj.tool_choice && bodyObj.tool_choice !== 'none') {
    bodyObj.tool_choice = 'auto';
  }

  const reasoningEnabled = !off;

  // Thinking models often get stuck in endless reasoning loops
  // if temperature is forced to 0 (which the proxy does for syntax repairs).
  if (reasoningEnabled) delete bodyObj.temperature;

  return { reasoningEnabled };
};
