// The model for an environment provider that has a key but no
// OPENAI_LLM_MODEL (providers.js marks it `autoModel`). Hosting setups such
// as a Hugging Face Space often get just the one secret, OPENAI_API_KEY; the
// newest general model the key can use is picked from the provider's own
// model list, so no model name here goes stale. Looked up once per key.
import { listProviderModels } from './providerModels.js';

// Version numbers in a model id, for "newest first": gpt-5.5 → [5, 5].
const version = (id) => (id.match(/\d+/g) || []).map(Number);
const newer = (a, b) => {
  const va = version(a);
  const vb = version(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i += 1) {
    const diff = (vb[i] ?? -1) - (va[i] ?? -1);
    if (diff) return diff;
  }
  return a.localeCompare(b);
};

// Per provider, the kinds of model to prefer, best first. Gemini lists its
// ids as "models/gemini-…", so ids are matched without that prefix.
const PREFERENCES = {
  openai: [/^gpt-\d+(?:\.\d+)?$/, /^gpt-\d+(?:\.\d+)?-\d{4}-\d{2}-\d{2}$/, /^gpt-\d/],
  anthropic: [/^claude-sonnet-\d+(?:-\d)?$/, /^claude-sonnet-/, /^claude-opus-/, /^claude-/],
  gemini: [/^gemini-\d+(?:\.\d+)?-pro$/, /^gemini-\d+(?:\.\d+)?-pro/, /^gemini-\d+(?:\.\d+)?-flash$/, /^gemini-/],
  xai: [/^grok-\d+(?:\.\d+)?$/, /^grok-\d+(?:\.\d+)?(?!.*(?:mini|image|vision|imagine))/, /^grok-/],
  deepseek: [/^deepseek-v\d+(?:\.\d+)?-pro$/, /^deepseek-chat$/, /^deepseek-/],
};

// OpenRouter's own router picks a model per request; its catalog is too
// broad to choose from by name.
const FIXED = { openrouter: 'openrouter/auto' };

export const chooseModel = (providerId, ids) => {
  const bare = (id) => id.replace(/^models\//, '');
  for (const pattern of PREFERENCES[providerId] || []) {
    const matches = ids.filter((id) => pattern.test(bare(id)));
    if (matches.length) return matches.sort((a, b) => newer(bare(a), bare(b)))[0];
  }
  return ids[0] || '';
};

const cache = new Map();

// Resolves to the model id, or throws with a message naming OPENAI_LLM_MODEL.
export const defaultModel = (provider, { fetchImpl = globalThis.fetch } = {}) => {
  if (FIXED[provider.id]) return Promise.resolve(FIXED[provider.id]);
  const cacheKey = `${provider.id}\n${provider.apiKey}`;
  if (!cache.has(cacheKey)) {
    const lookup = listProviderModels({ id: provider.id, apiKey: provider.apiKey }, { fetchImpl })
      .then((models) => {
        const model = chooseModel(provider.id, models.map((m) => m.id));
        if (!model) throw new Error(`${provider.label} listed no models for this key.`);
        // Not on a Hugging Face Space (SPACE_ID), whose logs can be shown to others.
        if (!globalThis.process?.env?.SPACE_ID) console.log(`[llm] OPENAI_LLM_MODEL is empty; using ${provider.label}'s ${model}.`);
        return model;
      })
      .catch((err) => {
        // Try again on the next request (a network blip, a key fixed later).
        cache.delete(cacheKey);
        throw new Error(`${err?.message || 'Could not load the model list.'} Set OPENAI_LLM_MODEL to choose a model.`);
      });
    cache.set(cacheKey, lookup);
  }
  return cache.get(cacheKey);
};
