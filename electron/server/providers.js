// LLM providers the proxies can talk to. The server-configured provider stays
// DeepSeek; users can choose OpenRouter, Anthropic, OpenAI, Gemini, xAI or DeepSeek through Settings.
// Environment variables follow the OPENAI_LLM_* standard names.

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

import { staticReasoningLevels, nearestLevel, EFFORT_SCALE } from './reasoning.js';

const PRESET_DEFAULTS = { forcedToolChoice: true, streamUsage: true };

// The plain APPBLIPS_LLM_* variables: any OpenAI-compatible endpoint.
export const DEFAULT_PROVIDER = 'deepseek';

// Output limit for building, editing, repairs and reviews when Settings → AI
// has none. Without one, providers apply their own default, which can be a
// few thousand tokens: a whole app then stops halfway and no search/replace
// repair can bring back the missing half. Current hosted models allow at
// least this much; a provider that rejects it gets the request again with the
// largest limit its error allows (chatProxy.js). Ask mode keeps the provider
// default, except on Anthropic, which requires a limit.
export const DEFAULT_BUILD_MAX_TOKENS = 64000;

// APPBLIPS_MAX_OUTPUT_TOKENS: an operator-set output limit for every chat
// request on this server (the hosted web version). When set, the limit in
// Settings → AI is ignored and hidden. 0 means not set; blank or unreadable
// values count as not set.
export const fixedMaxOutputTokens = (env) => {
  const value = Number(String(env?.APPBLIPS_MAX_OUTPUT_TOKENS ?? '').replace(/[,_\s]/g, ''));
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
};
export const PROVIDER_IDS = ['deepseek'];

const OFF_EFFORTS = new Set([false, 'none', 'off', 'disabled', '']);

// APPBLIPS_REASONING_EFFORT: an operator-set reasoning level for Free AI (the
// server's own provider): one of EFFORT_SCALE, or off. When set, the
// Reasoning choice in Settings → AI is hidden while Free is in use. Blank or
// unreadable values count as not set ('').
export const fixedReasoningEffort = (env) => {
  const value = String(env?.APPBLIPS_REASONING_EFFORT ?? '').trim().toLowerCase();
  if (value === 'off') return 'none';
  return EFFORT_SCALE.includes(value) ? value : '';
};

// The level a Free AI request runs with. Chat-only calls ask for Off and keep
// it (they never reason); calls that ask for any level get the server's.
export const freeReasoningEffort = (env, requested) => {
  const fixed = fixedReasoningEffort(env);
  if (!fixed || requested == null || OFF_EFFORTS.has(requested)) return requested;
  return fixed;
};

const read = (env, name) => String(env?.[name] ?? '').trim();
const warned = new Set();

// The generic LLM variables. Every provider here but Anthropic speaks the
// OpenAI-compatible API, so they follow the OpenAI SDK's own names (OPENAI_API_KEY,
// OPENAI_BASE_URL).
export const LLM_ENV = {
  PROVIDER: 'OPENAI_LLM_PROVIDER',
  API_KEY: 'OPENAI_API_KEY',
  BASE_URL: 'OPENAI_BASE_URL',
  MODEL: 'OPENAI_LLM_MODEL',
  // Optional per-role models on the same provider (chatProxy.js routeModel).
  VISION_MODEL: 'OPENAI_LLM_VISION_MODEL',
  TEMPERATURE: 'OPENAI_LLM_TEMPERATURE',
};
export const llmEnv = (env, name) => {
  return read(env, LLM_ENV[name]);
};

// Variable-name scope for a provider id: APPBLIPS_ZAI, APPBLIPS_ZAI_CODING.
// Hyphens in ids become underscores, since they aren't valid in env names.
export const providerVarScope = (id, prefix = 'APPBLIPS_LLM') =>
  `${prefix.replace(/_LLM$/, '')}_${id.toUpperCase().replace(/-/g, '_')}`;

// Variable names for one provider's block. prefix: 'APPBLIPS_LLM'.
const varNames = (id, prefix) => {
  const generic = prefix === 'APPBLIPS_LLM'
    ? { apiKey: LLM_ENV.API_KEY, model: LLM_ENV.MODEL, baseUrl: LLM_ENV.BASE_URL }
    : { apiKey: `${prefix}_API_KEY`, model: `${prefix}_MODEL`, baseUrl: `${prefix}_BASE_URL` };
  if (id === DEFAULT_PROVIDER) return { own: generic, fallback: generic };
  const scope = providerVarScope(id, prefix);
  return {
    own: { apiKey: `${scope}_API_KEY`, model: `${scope}_MODEL`, baseUrl: `${scope}_BASE_URL` },
    fallback: generic,
  };
};

// Picks the active provider for `prefix` and returns its settings:
//   { id, apiKey, model, baseUrl, reasoningParam, forcedToolChoice, streamUsage,
//     missing }   -- `missing` lists the variables still to be filled in
// or { error } when nothing usable is configured, so callers can report it
// ({ error, unconfigured: true } when no provider key is set at all).
// `alsoConfigured` lists other providers whose keys are set but were passed
// over. The ambiguity is logged once per prefix; `quiet` means the caller
// reports it itself (the startup summary), so the log is skipped.
export const resolveProvider = (env, prefix, { quiet = false } = {}) => {
  // The builder's generic variables go through llmEnv (new name, then the
  // pre-rename one); any other prefix is read as-is.
  const builder = prefix === 'APPBLIPS_LLM';
  const generic = (field) => builder ? llmEnv(env, field) : read(env, `${prefix}_${field}`);
  const fieldKey = { apiKey: 'API_KEY', model: 'MODEL', baseUrl: 'BASE_URL' };
  const providerVar = builder ? LLM_ENV.PROVIDER : `${prefix}_PROVIDER`;
  const requested = generic('PROVIDER').toLowerCase();
  let id = requested;
  let alsoConfigured = [];
  if (requested && !PROVIDERS[requested]) {
    return { error: `Unknown ${providerVar} "${requested}". Use one of: ${Object.keys(PROVIDERS).join(', ')}.` };
  }
  // With no provider named and no endpoint of its own, the builder's key
  // says whose it is: an OpenAI, Anthropic, Gemini or OpenRouter key set on
  // its own goes to that provider instead of DeepSeek.
  if (!id && builder && !generic('BASE_URL')) id = providerForKey(generic('API_KEY'));
  if (!id) {
    const configured = PROVIDER_IDS.filter((candidate) => (candidate === DEFAULT_PROVIDER
      ? generic('API_KEY')
      : read(env, varNames(candidate, prefix).own.apiKey)));
    if (!configured.length) {
      const example = varNames('deepseek', prefix).own.apiKey;
      return { unconfigured: true, error: `No AI provider is configured. In your .env, fill in the API key for ONE provider (for example ${example}) and set ${varNames(DEFAULT_PROVIDER, prefix).own.model}, then restart.` };
    }
    id = configured[0];
    alsoConfigured = configured.slice(1);
    if (alsoConfigured.length && !warned.has(prefix)) {
      warned.add(prefix);
      if (!quiet) console.warn(`[llm] Several providers have an API key set (${configured.join(', ')}); using ${id}. Set ${providerVar} to choose.`);
    }
  }

  const names = varNames(id, prefix);
  // The openai-compatible block's "own" names are the generic ones, so its
  // own read is skipped and the generic (with the legacy fallback) answers.
  const pick = (field) => (id === DEFAULT_PROVIDER ? '' : read(env, names.own[field])) || generic(fieldKey[field]);
  const preset = PROVIDERS[id];
  const baseUrl = pick('baseUrl') || preset.baseUrl;
  const model = pick('model');
  const provider = {
    id,
    ...PRESET_DEFAULTS,
    ...preset,
    apiKey: pick('apiKey'),
    model,
    // On a provider's own endpoint an empty model is chosen for the user
    // (defaultModel.js); a custom endpoint still needs one named.
    autoModel: !model && baseUrl === preset.baseUrl,
    baseUrl,
    reasoningParam: preset.reasoningParam,
    alsoConfigured,
    // Where to point the user: the provider's own key variable, but the shared
    // model / base URL lines.
    vars: { apiKey: names.own.apiKey, model: names.fallback.model, baseUrl: names.fallback.baseUrl },
  };
  provider.missing = missingVars(provider);
  return provider;
};

// User-selected providers are separate from the server-owned environment provider.
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
// OpenRouter as a preset, or as the endpoint behind the .env provider.
export const isOpenRouter = (provider) => {
  if (provider?.id === 'openrouter') return true;
  try { return /(^|\.)openrouter\.ai$/i.test(new URL(provider?.baseUrl).hostname); } catch { return false; }
};
export const UNCENSORED_ERROR = 'Uncensored models are not available in AppBlips. Choose a different model.';

const MAX_USER_KEY_LENGTH = 512;
const MAX_USER_MODEL_LENGTH = 200;

// Builds a provider from user-supplied settings (the request's
// `user_provider` field). Same shape as resolveProvider, or { error }. The
// environment endpoint is deliberately not applied to user settings.
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
    alsoConfigured: [],
    missing: [],
    userSupplied: true,
  };
};

// Whose key this is, from the prefix each provider gives its keys, or ''
// when it can't tell (DeepSeek's and older OpenAI keys are both plain sk-).
export const providerForKey = (key) => {
  if (/^sk-ant-/.test(key)) return 'anthropic';
  if (/^sk-or-/.test(key)) return 'openrouter';
  if (/^AIza/.test(key)) return 'gemini';
  if (/^xai-/.test(key)) return 'xai';
  if (/^sk-(?:proj|svcacct|admin)-/.test(key)) return 'openai';
  return '';
};

// What the page may learn about the environment provider: whether it can
// answer /api/chat without Settings → AI, and which provider and model it
// uses. Never the key.
export const envProviderStatus = (env) => {
  const provider = resolveProvider(env, 'APPBLIPS_LLM', { quiet: true });
  if (provider.error || provider.missing.length) return { envConfigured: false };
  return { envConfigured: true, envProvider: { id: provider.id, label: provider.label, model: provider.model } };
};

// The variables still to be filled in for `provider`.
const missingVars = (provider) => [
  !provider.apiKey && provider.vars.apiKey,
  !provider.model && !provider.autoModel && provider.vars.model,
  !provider.baseUrl && provider.vars.baseUrl,
].filter(Boolean);

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
