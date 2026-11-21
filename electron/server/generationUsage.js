// The final token counts of an OpenRouter request, from its generation stats
// (GET /generation?id=). A stream stopped part-way ends before the usage chunk
// that normally carries them, but OpenRouter still records the generation, so
// the page asks here afterwards (llm.js) and the Build pane's token counter
// swaps its estimate for these. Reached as an `/api/chat` request with a
// `usage_lookup` id (chatProxy.js), so every host attaches the saved key the
// same way. Own OpenRouter keys only.

const GENERATION_ID = /^gen-[0-9A-Za-z-]{1,124}$/;
// A generation can take a few seconds to appear after the request ends; until
// then the lookup answers 404.
const RETRY_DELAYS_MS = [1500, 3000, 6000];

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

const count = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)) : 0);
const known = (value) => value != null && Number.isFinite(Number(value));

// The generation's counts in the chat-completions shape the token counter
// reads (tokenUsage.js normalizeUsage). The provider's own (native) counts are
// preferred, as in its usage chunk. Completion includes reasoning there; the
// reasoning count is only a floor in case a provider leaves it out.
export const usageFromGeneration = (data) => {
  if (!data || typeof data !== 'object') return null;
  const promptRaw = known(data.native_tokens_prompt) ? data.native_tokens_prompt : data.tokens_prompt;
  const completionRaw = known(data.native_tokens_completion) ? data.native_tokens_completion : data.tokens_completion;
  if (!known(promptRaw) && !known(completionRaw)) return null;
  const prompt = count(promptRaw);
  const completion = Math.max(count(completionRaw), count(data.native_tokens_reasoning));
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    prompt_tokens_details: { cached_tokens: Math.min(prompt, count(data.native_tokens_cached)) },
  };
};

export async function lookupGenerationUsage(id, provider, { fetchImpl = globalThis.fetch, delays = RETRY_DELAYS_MS, signal } = {}) {
  if (!provider?.userSupplied || provider.id !== 'openrouter') {
    return json({ error: 'Token counts can only be looked up for your own OpenRouter key.' }, 400);
  }
  if (typeof id !== 'string' || !GENERATION_ID.test(id)) return json({ error: 'Invalid generation ID.' }, 400);
  const url = `${provider.baseUrl}/generation?id=${encodeURIComponent(id)}`;
  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, { headers: { Authorization: `Bearer ${provider.apiKey}` }, signal });
    } catch {
      return json({ usage: null });
    }
    if (response.status === 404 && attempt < delays.length) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      continue;
    }
    if (!response.ok) return json({ usage: null });
    const body = await response.json().catch(() => null);
    return json({ usage: usageFromGeneration(body?.data) });
  }
}
