// Run: node testing/testPublicWritingStop.js
// With Google Sheets Backend connected, AppBlips doesn't build features that
// let visitors write to the public (anything a visitor types that other
// visitors can see). The quick reply that opens every build and edit
// (llm.js generateChatReply) gets PUBLIC_WRITING_REPLY_NOTE and the ask tool,
// so it can stop and ask before anything is built: no word list, no extra
// call. Scripted API responses stand in for the AI provider.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const URL_OK = 'https://script.google.com/macros/s/AKfycbx1234567890abcdefghijKLMNOP/exec';
const SHEETS_ON = JSON.stringify({ sheets: { enabled: true, key: URL_OK } });
let stored = SHEETS_ON;
globalThis.window = { localStorage: { length: 0, getItem: () => stored, setItem: () => {}, removeItem: () => {} } };

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
const savedFetch = globalThis.fetch;
try {
  const { generateAppCode, generateChatReply } = await server.ssrLoadModule('/src/lib/llm.js');
  const { buildHtmlSystemPrompt } = await server.ssrLoadModule('/src/lib/prompts.js');

  const html = '<!DOCTYPE html><html><head><title>T</title></head><body><h1>Hi</h1></body></html>';
  const ask = (question) => ({ tool_calls: [{ id: 'c1', type: 'function', function: { name: 'ask_clarifying_questions', arguments: JSON.stringify({ question }) } }] });
  // The opening reply is the request that may carry the ask tool; anything
  // else gets the page (the build) or a plain sentence.
  let introAnswer = null;
  let requests = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    const system = body.messages?.[0]?.content || '';
    const isIntro = /chat\. The user has just asked/.test(system);
    const message = isIntro ? introAnswer : /single-file|website/i.test(system) ? { content: `Done.\n\n${html}` } : { content: 'Done.' };
    if (!body.stream) return Response.json({ choices: [{ message }] });
    // Streamed, as the opening reply always is: the text, or the tool call.
    const delta = message.tool_calls
      ? { tool_calls: message.tool_calls.map((call, index) => ({ index, ...call })) }
      : { content: message.content };
    return new Response(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  };
  const generate = (prompt, history = []) => generateAppCode(
    prompt, null, history, null, 'both', null, false, false, null, false,
    { build: 'none' }, 'website', null, '', false, false, '', false, null,
  );
  const introRequest = () => requests.find((r) => /chat\. The user has just asked/.test(r.messages?.[0]?.content || ''));

  const OFFER = 'I haven’t built anything yet. Letting visitors post publicly isn’t supported yet because spam can’t be removed. I can add a private message box instead. Should I build it that way?';
  const REFUSAL = 'I can’t build public posts yet, since there’s no way to remove spam. A supported extension is planned, and I’m happy to build the private version or anything else.';

  // 1. A request that needs public writing stops at the opening reply: one
  //    request, which carried the rule and the ask tool. Nothing was built.
  requests = [];
  introAnswer = ask(OFFER);
  let result = await generate('Make a lost and found board where people post what they found');
  assert.equal(result.editMode, 'clarify');
  assert.equal(result.reply, OFFER);
  assert.equal(result.code, '');
  assert.equal(requests.length, 1, 'stopped before building');
  assert.match(requests[0].messages[0].content, /GOOGLE SHEETS BACKEND RULE/);
  assert.equal(requests[0].tools?.[0]?.function?.name, 'ask_clarifying_questions');

  // 2. The user agrees: the opening reply sees the conversation, writes the
  //    usual reply, and the build goes ahead.
  const history = [{ role: 'user', content: 'Make a wedding site with a guestbook' }, { role: 'assistant', content: OFFER }];
  requests = [];
  introAnswer = { content: 'Great, building your wedding site with a private message box.' };
  result = await generate('yes', history);
  assert.notEqual(result.editMode, 'clarify');
  assert.match(result.code, /<h1>Hi<\/h1>/);
  assert.match(introRequest().messages[1].content, /Assistant: I haven’t built anything yet/);
  assert.ok(requests.length >= 2, 'the build ran');

  // 3. The user insists on public posts: a polite refusal, still nothing built.
  requests = [];
  introAnswer = ask(REFUSAL);
  result = await generate('no, everyone should see the messages', history);
  assert.equal(result.editMode, 'clarify');
  assert.equal(result.reply, REFUSAL);
  assert.equal(requests.length, 1, 'nothing was built');

  // 4. An ordinary request builds as usual: the opening reply just replies.
  requests = [];
  introAnswer = { content: 'On it.' };
  result = await generate('Add an RSVP form');
  assert.match(result.code, /<h1>Hi<\/h1>/);

  // 5. Without Google Sheets Backend: no rule, no tool, and (with no chat
  //    callback) no opening reply at all, as before.
  stored = '{}';
  requests = [];
  introAnswer = ask(OFFER);
  result = await generate('Make a lost and found board where people post what they found');
  assert.notEqual(result.editMode, 'clarify');
  assert.ok(!requests.some((r) => /GOOGLE SHEETS BACKEND RULE/.test(r.messages?.[0]?.content || '')));
  assert.ok(!requests.some((r) => r.tools?.some((t) => t.function?.name === 'ask_clarifying_questions')));
  stored = SHEETS_ON;

  // 6. Other callers (imported codebases) still get plain text back.
  introAnswer = { content: 'Sure.' };
  assert.equal(await generateChatReply({ prompt: 'Add a guestbook', currentCode: 'codebase', studioMode: 'codebase' }), 'Sure.');

  // 7. If the opening reply fails, the build still goes ahead.
  requests = [];
  const workingFetch = globalThis.fetch;
  let failIntro = true;
  globalThis.fetch = async (url, options) => {
    const system = JSON.parse(options.body).messages?.[0]?.content || '';
    if (failIntro && /chat\. The user has just asked/.test(system)) { failIntro = false; return new Response('{"error":{"message":"bad"}}', { status: 400 }); }
    return workingFetch(url, options);
  };
  result = await generate('Add a poll');
  assert.match(result.code, /<h1>Hi<\/h1>/);
  globalThis.fetch = workingFetch;

  // The build prompt keeps the rule as a backstop.
  const prompt = buildHtmlSystemPrompt('website', [{ id: 'sheets', key: URL_OK }]);
  assert.match(prompt, /NEVER LET VISITORS WRITE TO THE PUBLIC/);
  assert.match(prompt, /Never build a public version, even if asked/);

  console.log('testPublicWritingStop: ok');
} finally {
  globalThis.fetch = savedFetch;
  await server.close();
}
