// Run: node testing/testAskWebSearch.js
// Ask mode can search the web (the globe under the chat box, or the Tavily
// connector): llm.js generateAppCode's Ask branch offers the web tools, runs
// the searches, and answers on the next turn. Text streamed before a search
// is dropped (clear_reply), so the reply is only the final answer. Scripted
// API responses stand in for the AI provider and Tavily.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const data = new Map();
globalThis.window = { localStorage: {
  get length() { return data.size; },
  getItem: (k) => (data.has(k) ? data.get(k) : null),
  setItem: (k, v) => { data.set(k, String(v)); },
  removeItem: (k) => { data.delete(k); },
} };

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
const savedFetch = globalThis.fetch;
try {
  const { generateAppCode } = await server.ssrLoadModule('/src/lib/llm.js');
  const { saveConnectors } = await server.ssrLoadModule('/src/lib/connectors.js');

  const search = { id: 's1', type: 'function', function: { name: 'web_search', arguments: JSON.stringify({ query: 'Blue Door Cafe opening hours', topic: 'general', time_range: null }) } };
  const ANSWER = 'Blue Door Café is open 8am to 4pm.';
  let modelRequests = [];
  let searches = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (String(url).includes('/api/tavily/search')) {
      searches.push(body.query);
      return Response.json({ results: [{ title: 'Blue Door Café', url: 'https://bluedoor.example/', content: 'Open 8am to 4pm.' }] });
    }
    modelRequests.push(body);
    const searched = body.messages.some((m) => m.role === 'tool');
    const offered = body.tools?.some((t) => t.function?.name === 'web_search');
    const deltas = offered && !searched
      ? [{ content: 'Let me look that up.' }, { tool_calls: [{ index: 0, ...search }] }]
      : [{ content: ANSWER }];
    const stream = deltas.map((delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`).join('');
    return new Response(`${stream}data: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  };
  const ask = async (question) => {
    const chunks = [];
    const result = await generateAppCode(
      question, null, [], (chunk, kind) => chunks.push([kind, chunk]), 'both', null, true, false, null, false,
      { build: 'none' }, 'app', null, '', false, false, '', false, null,
    );
    return { result, chunks };
  };

  // 1. With search connected, the answer searches first, then replies with
  //    only the final text.
  saveConnectors({ tavily: { enabled: true, key: '', keyHint: '0e1f' } });
  modelRequests = []; searches = [];
  let { result, chunks } = await ask('What are Blue Door Café’s opening hours?');
  assert.equal(result.editMode, 'ask');
  assert.equal(result.reply, ANSWER);
  assert.deepEqual(searches, ['Blue Door Cafe opening hours']);
  assert.equal(modelRequests.length, 2);
  assert.match(modelRequests[0].messages[0].content, /WEB SEARCH/);
  assert.equal(modelRequests[0].tools?.[0]?.function?.name, 'web_search');
  const tool = modelRequests[1].messages.find((m) => m.role === 'tool');
  assert.ok(tool && tool.tool_call_id === 's1', 'the search result goes back to the model');
  const cleared = chunks.findIndex(([kind]) => kind === 'clear_reply');
  assert.ok(cleared > -1, 'the text before the search is dropped');
  assert.ok(chunks.slice(cleared).some(([kind, chunk]) => kind === 'content' && chunk === ANSWER));
  assert.ok(chunks.some(([kind]) => kind === 'status'), 'the search shows as a status');

  // 2. Without web search, Ask is one plain request with no tools.
  saveConnectors({ tavily: { enabled: false, key: '', keyHint: '0e1f' } });
  modelRequests = []; searches = [];
  ({ result } = await ask('What does this app do?'));
  assert.equal(result.reply, ANSWER);
  assert.equal(modelRequests.length, 1);
  assert.equal(modelRequests[0].tools, undefined);
  assert.doesNotMatch(modelRequests[0].messages[0].content, /WEB SEARCH/);
  assert.deepEqual(searches, []);

  console.log('ok');
} finally {
  globalThis.fetch = savedFetch;
  await server.close();
}
