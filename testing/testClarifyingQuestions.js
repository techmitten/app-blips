// Run: node testing/testClarifyingQuestions.js
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.window = { localStorage: { length: 0, getItem: () => null, setItem: () => {}, removeItem: () => {} } };

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
const savedFetch = globalThis.fetch;

try {
  const {
    MAX_CLARIFYING_QUESTIONS,
    normalizeClarifyingQuestions,
    parseClarifyingQuestionsArgs,
    formatClarifyingQuestionsReply,
    formatClarifyingAnswers,
  } = await server.ssrLoadModule('/src/lib/clarifyingQuestions.js');
  const {
    ASK_CLARIFYING_QUESTIONS_KEY,
    loadAskClarifyingQuestions,
    PROMPT_SUGGESTIONS_KEY,
    loadPromptSuggestions,
  } = await server.ssrLoadModule('/src/lib/config.js');
  const { generateAppCode } = await server.ssrLoadModule('/src/lib/llm.js');

  // 0. Defaults: clarifying questions on by default, suggested prompts off by default.
  const store = new Map();
  globalThis.window.localStorage = {
    get length() { return store.size; },
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  assert.equal(loadAskClarifyingQuestions(), true, 'clarifying questions default to on');
  assert.equal(loadPromptSuggestions(), false, 'suggested prompts default to off');
  store.set(ASK_CLARIFYING_QUESTIONS_KEY, 'false');
  assert.equal(loadAskClarifyingQuestions(), false, 'explicit false disables clarifying questions');
  store.set(PROMPT_SUGGESTIONS_KEY, 'true');
  assert.equal(loadPromptSuggestions(), true, 'explicit true enables suggested prompts');
  store.clear();

  // 1. Normalization: caps at max 3, strips "Other"-like options, deduplicates,
  //    moves a tagged recommended choice first, and never invents a tag the
  //    model left out (some questions have no right default, e.g. opening hours).
  const normalized = normalizeClarifyingQuestions([
    { question: '  What is the main goal?  ', options: ['Track habits', 'track habits', 'Journal daily', 'Other (specify)'] },
    { question: 'What style do you want?', options: ['Minimal', 'Bold (Recommended)', 'Something else'] },
    { question: 'How should data be grouped?', options: ['By day (recommended)', 'By category', 'Custom'] },
    { question: 'Fourth question should be dropped', options: ['A', 'B'] },
  ]);
  assert.equal(normalized.length, MAX_CLARIFYING_QUESTIONS);
  assert.deepEqual(normalized[0], { question: 'What is the main goal?', options: ['Track habits', 'Journal daily'] });
  assert.deepEqual(normalized[1], { question: 'What style do you want?', options: ['Bold (recommended)', 'Minimal'] });
  assert.deepEqual(normalized[2], { question: 'How should data be grouped?', options: ['By day (recommended)', 'By category'] });

  assert.deepEqual(
    normalizeClarifyingQuestions([{ question: 'Opening hours?', options: ['Mon-Fri 9-5', '24/7'] }])[0].options,
    ['Mon-Fri 9-5', '24/7'],
    'an untagged question stays untagged',
  );
  assert.deepEqual(
    normalizeClarifyingQuestions([{ question: 'Layout?', options: ['A (recommended)', 'B (recommended)'] }])[0].options,
    ['A (recommended)', 'B'],
    'only the first tag is kept',
  );

  // 2. Parser: handles structured questions, legacy single question, and invalid JSON.
  const structured = parseClarifyingQuestionsArgs(JSON.stringify({
    questions: [
      { question: 'Primary audience?', options: ['Students', 'Teams'] },
      { question: 'Preferred layout?', options: ['Single page', 'Tabbed views'] },
    ],
  }));
  assert.equal(structured.questions.length, 2);
  assert.match(structured.reply, /1\. Primary audience\?/);
  assert.match(structured.reply, /2\. Preferred layout\?/);

  const legacy = parseClarifyingQuestionsArgs(JSON.stringify({ question: 'Which color theme?' }));
  assert.equal(legacy.questions, null);
  assert.equal(legacy.reply, 'Which color theme?');

  const malformed = parseClarifyingQuestionsArgs('{not json');
  assert.equal(malformed.questions, null);
  assert.ok(malformed.parseError);
  assert.equal(malformed.reply, 'Could you clarify what you mean?');

  // 3. Formatting answers & reply text (strips "(recommended)" from submitted answers).
  const formattedReply = formatClarifyingQuestionsReply(structured.questions);
  assert.match(formattedReply, /^Before I build, a few quick questions:/);
  const formattedAnswers = formatClarifyingAnswers(structured.questions, ['Teams (recommended)', 'Compact dashboard']);
  assert.equal(
    formattedAnswers,
    '1. Primary audience? — Teams\n2. Preferred layout? — Compact dashboard'
  );

  // 4. End-to-end generateAppCode with askClarifyingQuestions = true.
  const html = '<!DOCTYPE html><html><head><title>App</title></head><body><h1>Ready</h1></body></html>';
  let clarifyResponse = null;
  let requests = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    const system = body.messages?.[0]?.content || '';
    const isClarify = /questions \(usually 2 or 3\) about what it leaves open/.test(system);
    const message = isClarify
      ? clarifyResponse
      : { content: `Built it.\n\n${html}` };
    if (!body.stream) return Response.json({ choices: [{ message }] });
    const delta = message.tool_calls
      ? { tool_calls: message.tool_calls.map((call, index) => ({ index, ...call })) }
      : { content: message.content };
    return new Response(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    });
  };

  // 4a. Model asks 4 questions -> capped to 3 and "Other" stripped.
  requests = [];
  clarifyResponse = {
    tool_calls: [{
      id: 'call_1',
      type: 'function',
      function: {
        name: 'ask_clarifying_questions',
        arguments: JSON.stringify({
          questions: [
            { question: 'What is your main goal?', options: ['Personal tracking', 'Team sharing', 'Other'] },
            { question: 'What visual vibe fits best?', options: ['Clean & minimal', 'Playful & bright', 'Dark mode'] },
            { question: 'Which view should open first?', options: ['Today list', 'Weekly calendar'] },
            { question: 'Extra 4th question?', options: ['Yes', 'No'] },
          ],
        }),
      },
    }],
  };

  let result = await generateAppCode(
    'Build a habit tracker', null, [], null, 'both', null, false, true, null, false,
    { build: 'none' }, 'app', null, '', false, false, '', false, null
  );
  assert.equal(result.editMode, 'clarify');
  assert.equal(result.code, '');
  assert.equal(result.clarifyingQuestions.length, 3);
  assert.deepEqual(result.clarifyingQuestions[0].options, ['Personal tracking', 'Team sharing']);
  assert.equal(requests.length, 1, 'stopped before building');
  assert.equal(requests[0].tools?.[0]?.function?.name, 'ask_clarifying_questions');
  assert.equal(requests[0].tools?.[0]?.function?.parameters?.properties?.questions?.type, 'array');

  // 4b. Model replies PROCEED -> continues to build the app.
  requests = [];
  clarifyResponse = { content: 'PROCEED' };
  result = await generateAppCode(
    'Build a dark-mode Pomodoro timer with 25/5 intervals and a sound chime', null, [], null, 'both', null, false, true, null, false,
    { build: 'none' }, 'app', null, '', false, false, '', false, null
  );
  assert.notEqual(result.editMode, 'clarify');
  assert.match(result.code, /<h1>Ready<\/h1>/);
  assert.ok(requests.length >= 2, 'proceeded to build');

  // 4c. Follow-up / edit prompt (currentCode exists) -> never asks clarifying questions,
  // even when askClarifyingQuestions is true.
  requests = [];
  clarifyResponse = {
    tool_calls: [{
      id: 'call_should_not_run',
      type: 'function',
      function: {
        name: 'ask_clarifying_questions',
        arguments: JSON.stringify({
          questions: [
            { question: 'Should not be asked?', options: ['A', 'B'] },
            { question: 'Really should not?', options: ['C', 'D'] },
          ],
        }),
      },
    }],
  };
  let sawClarifyRequest = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    // The initial-build questions request (its own system prompt), which must
    // never run on an edit. The skill's tool may be offered to the edit agent.
    if (/questions \(usually 2 or 3\) about what it leaves open/.test(body.messages?.[0]?.content || '')) {
      sawClarifyRequest = true;
    }
    // For surgical edit calls, apply a valid surgical edit so the edit loop completes.
    if (body.tools?.some((t) => t.function?.name === 'apply_surgical_edits')) {
      const editCall = {
        tool_calls: [{
          id: 'edit_1',
          type: 'function',
          function: {
            name: 'apply_surgical_edits',
            arguments: JSON.stringify({
              edits: [{ search: '<h1>Ready</h1>', replace: '<h1>Updated</h1>' }],
            }),
          },
        }],
      };
      const doneReply = { content: 'Updated the heading.' };
      const hasToolResult = body.messages?.some((m) => m.role === 'tool');
      const message = hasToolResult ? doneReply : editCall;
      if (!body.stream) return Response.json({ choices: [{ message }] });
      const delta = message.tool_calls
        ? { tool_calls: message.tool_calls.map((call, index) => ({ index, ...call })) }
        : { content: message.content };
      return new Response(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`, {
        headers: { 'content-type': 'text/event-stream' },
      });
    }
    return originalFetch(url, options);
  };
  result = await generateAppCode(
    'Make the title say Updated', html, [], null, 'both', null, false, true, null, false,
    { build: 'none' }, 'app', { 'index.html': html }, '', false, false, '', false, null
  );
  globalThis.fetch = originalFetch;
  assert.equal(sawClarifyRequest, false, 'clarifying questions must not run on edits');
  assert.notEqual(result.editMode, 'clarify');
  assert.match(result.code, /<h1>Updated<\/h1>/);

  // 6. The skill after the first build: the edit agent is offered the tool only
  // while the skill is on, and calling it returns the questions instead of editing.
  const editTools = [];
  const skillFetch = (askOnEdit) => async (url, options) => {
    if (!String(url).includes('/api/')) return originalFetch(url, options);
    const body = JSON.parse(options.body);
    if (!body.tools?.some((t) => t.function?.name === 'apply_surgical_edits')) {
      return Response.json({ choices: [{ message: { content: 'question' } }] });
    }
    editTools.push(body.tools.map((t) => t.function?.name));
    const message = askOnEdit
      ? { tool_calls: [{ id: 'ask_1', type: 'function', function: { name: 'ask_clarifying_questions', arguments: JSON.stringify({ questions: [{ question: 'Which sizes?', options: ['S (recommended)', 'L'] }] }) } }] }
      : { content: 'Done.' };
    if (!body.stream) return Response.json({ choices: [{ message }] });
    const delta = message.tool_calls
      ? { tool_calls: message.tool_calls.map((call, index) => ({ index, ...call })) }
      : { content: message.content };
    return new Response(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  };
  const callSkill = () => generateAppCode(
    'Use the clarifying questions skill to understand what I need for this feature', html, [], null, 'both', null, false, true, null, false,
    { build: 'none' }, 'app', { 'index.html': html }, '', false, false, '', false, null
  );
  globalThis.fetch = skillFetch(true);
  result = await callSkill();
  assert.equal(result.editMode, 'clarify');
  assert.equal(result.clarifyingQuestions?.length, 1);
  assert.ok(editTools.at(-1).includes('ask_clarifying_questions'), 'skill on offers the tool');

  store.set(ASK_CLARIFYING_QUESTIONS_KEY, 'false');
  editTools.length = 0;
  globalThis.fetch = skillFetch(false);
  await callSkill().catch(() => {});
  globalThis.fetch = originalFetch;
  assert.ok(editTools.length > 0 && editTools.every((names) => !names.includes('ask_clarifying_questions')), 'skill off never offers the tool');

  // 7. /clarify: parsed only at the start, always asks (tool_choice required),
  // never edits, and tells the user when the skill is off.
  const { parseSkillCommand, stripSkillCommand, matchSkillCommands } = await server.ssrLoadModule('/src/lib/skills.js');
  assert.equal(parseSkillCommand('/clarify Add a checkout').request, 'Add a checkout');
  assert.equal(parseSkillCommand('  /CLARIFY').skill.id, 'clarify');
  assert.equal(parseSkillCommand('/clarifyx'), null);
  assert.equal(parseSkillCommand('/about page'), null);
  assert.equal(parseSkillCommand('please /clarify'), null);
  assert.equal(stripSkillCommand('/clarify Add a checkout'), 'Add a checkout');
  assert.deepEqual(matchSkillCommands('/cl').map((x) => x.id), ['clarify']);
  assert.deepEqual(matchSkillCommands('/clarify now'), []);

  store.set(ASK_CLARIFYING_QUESTIONS_KEY, 'true');
  const forced = [];
  globalThis.fetch = async (url, options) => {
    if (!String(url).includes('/api/')) return originalFetch(url, options);
    const body = JSON.parse(options.body);
    forced.push(body);
    const message = { tool_calls: [{ id: 'ask_2', type: 'function', function: { name: 'ask_clarifying_questions', arguments: JSON.stringify({ questions: [{ question: 'Card or PayPal?', options: ['Card (recommended)', 'PayPal'] }] }) } }] };
    if (!body.stream) return Response.json({ choices: [{ message }] });
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, ...message.tool_calls[0] }] } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  };
  const runClarify = (text, mode = false) => generateAppCode(
    text, html, [{ role: 'user', content: '/clarify Build a shop' }], null, 'both', null, mode, false, null, false,
    { build: 'none' }, 'app', { 'index.html': html }, '', false, false, '', false, null
  );
  result = await runClarify('/clarify Add a checkout page');
  assert.equal(result.editMode, 'clarify');
  assert.equal(result.code, html);
  assert.equal(forced.length, 1, 'one request, no intent check or edit loop');
  assert.equal(forced[0].tool_choice, 'required');
  assert.match(forced[0].messages[0].content, /called the Clarify skill/);
  assert.match(forced[0].messages[0].content, /Never ask a question that the user's request, or an earlier message in the conversation, already clearly answers/);
  assert.ok(forced[0].messages.every((m) => typeof m.content !== 'string' || !m.content.includes('/clarify')), 'the command never reaches the AI');

  result = await runClarify('/clarify Add a checkout page', true);
  assert.equal(result.editMode, 'ask');
  assert.match(result.reply, /Build mode/);

  store.set(ASK_CLARIFYING_QUESTIONS_KEY, 'false');
  forced.length = 0;
  result = await runClarify('/clarify Add a checkout page');
  globalThis.fetch = originalFetch;
  assert.equal(result.editMode, 'ask');
  assert.match(result.reply, /Settings → Skills/);
  assert.equal(forced.length, 0);

  console.log('testClarifyingQuestions: ok');
} finally {
  globalThis.fetch = savedFetch;
  await server.close();
}
