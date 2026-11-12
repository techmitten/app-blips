// Run: node testing/testScreenshotAck.js
// A preview screenshot sent with a build request is acknowledged in the chat
// reply before the build starts (llm.js generateChatReply), and any image sent
// is described in text for later turns (llm.js describeAttachment).
// Scripted API responses stand in for the AI provider, so no tokens are spent.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.window = { localStorage: { length: 0, getItem: () => null, setItem: () => {}, removeItem: () => {} } };

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
const savedFetch = globalThis.fetch;
try {
  const { generateChatReply, describeAttachment } = await server.ssrLoadModule('/src/lib/llm.js');

  const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
  const shot = { dataUrl, name: 'Preview screenshot', source: 'screenshot' };
  const upload = { dataUrl, name: 'photo.png', source: 'upload' };
  let requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    const body = JSON.parse(options.body);
    const text = 'I can see your screenshot, the button is cut off. I will make it fit.';
    if (!body.stream) return Response.json({ choices: [{ message: { content: text } }] });
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  };
  const sentImage = (request) => {
    const content = request.messages.at(-1).content;
    return Array.isArray(content) && content.some((part) => part.type === 'image_url' && part.image_url.url === dataUrl);
  };

  // A preview screenshot: the reply sees it and is told to acknowledge it.
  for (const studioMode of ['app', 'website', 'game', 'codebase']) {
    requests = [];
    const reply = await generateChatReply({ prompt: 'Fix this button', currentCode: '<html></html>', studioMode, attachment: shot });
    assert.match(reply, /^I can see your screenshot/);
    assert.equal(requests.length, 1);
    assert.ok(sentImage(requests[0]), `${studioMode}: the screenshot goes with the reply request`);
    assert.match(requests[0].messages[0].content, /I can see your screenshot/, `${studioMode}: told to acknowledge it`);
  }

  // A paperclip upload or no attachment: the reply is unchanged.
  for (const attachment of [upload, null]) {
    requests = [];
    await generateChatReply({ prompt: 'Fix this button', currentCode: '<html></html>', attachment });
    assert.equal(typeof requests[0].messages.at(-1).content, 'string', 'text only');
    assert.doesNotMatch(requests[0].messages[0].content, /I can see your screenshot/);
  }

  // Any image sent gets a text description; the image goes with that request.
  for (const attachment of [shot, upload]) {
    requests = [];
    const note = await describeAttachment({ attachment, prompt: 'Fix this button' });
    assert.ok(note.length > 0);
    assert.ok(sentImage(requests[0]), 'the image goes with the description request');
    assert.match(requests[0].messages.at(-1).content[0].text, /Fix this button/);
  }
  // No image: no request. A failed request: '' rather than an error.
  requests = [];
  assert.equal(await describeAttachment({ attachment: null }), '');
  assert.equal(requests.length, 0);
  const working = globalThis.fetch;
  globalThis.fetch = async () => new Response('nope', { status: 500 });
  assert.equal(await describeAttachment({ attachment: shot }), '');
  globalThis.fetch = working;

  console.log('testScreenshotAck: all checks passed');
} finally {
  globalThis.fetch = savedFetch;
  await server.close();
}
