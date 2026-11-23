// Run: node --test testing/testPuter.js
// Puter: the script added to exports and the stand-in added to the preview
// (lib/puterHelper.js), and the parent side that runs the stand-in's calls
// (lib/puterHost.js), against a fake Puter.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { injectPuterScript, injectPuterShim, usesPuter, PUTER_SCRIPT_URL } from '../src/lib/puterHelper.js';
import { createPuterHost, rootPath, toPuterError, PUTER_METHODS } from '../src/lib/puterHost.js';
import { BRIDGE_CHANNEL } from '../src/previewBridge/protocol.js';

const PAGE = '<!DOCTYPE html><html><head><title>x</title></head><body><script>puter.kv.set("a", 1)</script></body></html>';
const PLAIN = '<html><head><title>x</title></head><body><p>No Puter here: puter is just a word.</p></body></html>';
const REAL_TAG = `<script src="${PUTER_SCRIPT_URL}"></script>`;

// A fake Puter.js: an in-memory account.
const fakePuter = ({ signedIn = true } = {}) => {
  const kv = new Map();
  const files = new Map();
  const calls = [];
  const state = { signedIn };
  const base = '/ray/AppData/app-123/';
  return {
    calls,
    store: kv,
    files,
    state,
    auth: {
      isSignedIn: () => state.signedIn,
      signIn: async () => { state.signedIn = true; return { success: true }; },
      getUser: async () => ({ username: 'ray', uuid: 'u-1', is_temp: false, email: 'secret@example.com' }),
      signOut: async () => { state.signedIn = false; },
    },
    ai: {
      chat: async (prompt, options) => {
        calls.push(['chat', prompt, options]);
        if (options?.stream) {
          return (async function* stream() {
            yield { type: 'text', text: 'Hel' };
            yield { type: 'text', text: 'lo' };
          })();
        }
        return { message: { role: 'assistant', content: 'Hello' }, toString() { return 'Hello'; } };
      },
      txt2img: async (prompt, options) => { calls.push(['txt2img', prompt, options]); return { src: 'https://img.example/cat.png' }; },
      txt2speech: async () => ({ src: 'data:audio/mp3;base64,AAAA' }),
      img2txt: async () => 'some text',
    },
    kv: {
      set: async (key, value) => { calls.push(['kv.set', key]); kv.set(key, value); return true; },
      get: async (key) => (Array.isArray(key) ? key.map((k) => kv.get(k) ?? null) : kv.get(key) ?? null),
      del: async (key) => { kv.delete(key); return true; },
      incr: async (key, n) => { const v = (kv.get(key) || 0) + n; kv.set(key, v); return v; },
      decr: async (key, n) => { const v = (kv.get(key) || 0) - n; kv.set(key, v); return v; },
      list: async (pattern, values) => {
        const prefix = (typeof pattern === 'object' ? pattern.pattern : pattern).replace(/\*$/, '');
        const keys = [...kv.keys()].filter((k) => k.startsWith(prefix));
        return values ? keys.map((key) => ({ key, value: kv.get(key) })) : keys;
      },
    },
    fs: {
      write: async (path, data, options) => {
        calls.push(['fs.write', path, options]);
        files.set(path, data);
        return { name: path.split('/').pop(), path: base + path, is_dir: false, size: String(data).length, method() {} };
      },
      read: async (path) => {
        if (!files.has(path)) throw { code: 'subject_does_not_exist', message: 'Not found' };
        return new Blob([files.get(path)]);
      },
      readdir: async (path) => {
        const inside = [...files.keys()].filter((p) => p.startsWith(`${path}/`));
        if (!inside.length) throw { error: { code: 'subject_does_not_exist', message: 'Not found' } };
        return inside.map((p) => ({ name: p.split('/').pop(), path: base + p, is_dir: false, size: 1 }));
      },
      mkdir: async (path) => ({ name: path.split('/').pop(), path: base + path, is_dir: true }),
      delete: async (paths) => { for (const p of paths) files.delete(p); },
      getReadURL: async (path) => `https://puter.example/read/${path}`,
    },
  };
};

test('only pages that call Puter are touched', () => {
  assert.ok(usesPuter(PAGE));
  assert.ok(usesPuter('<script>await puter.ai.chat("hi")</script>'));
  assert.ok(!usesPuter(PLAIN));
  assert.equal(injectPuterScript(PLAIN), PLAIN);
  assert.equal(injectPuterShim(PLAIN, { token: 't' }), PLAIN);
});

test('exports get the real Puter.js once, first in <head>', () => {
  const out = injectPuterScript(PAGE);
  assert.ok(out.startsWith(`<!DOCTYPE html><html><head>${REAL_TAG}<title>`));
  assert.equal(injectPuterScript(out), out, 'not added twice');
  const own = PAGE.replace('<title>', `${REAL_TAG}<title>`);
  assert.equal(injectPuterScript(own), own, 'a page with its own tag is left alone');
});

test('the preview gets the stand-in, and any real Puter.js tag is removed', () => {
  const out = injectPuterShim(PAGE.replace('<title>', `${REAL_TAG}<title>`), { token: 'tok' });
  assert.ok(out.includes('<script data-appblips-puter>'));
  assert.ok(!out.includes('js.puter.com'));
  const source = out.match(/<script data-appblips-puter>([\s\S]*?)<\/script>/)[1];
  assert.ok(!source.includes('</'), 'the stand-in never closes its own tag early');
});

test('rootPath keeps every path inside the project folder', () => {
  assert.equal(rootPath('p1', 'notes/a.txt'), 'appblips-previews/p1/notes/a.txt');
  assert.equal(rootPath('p1', './notes//a.txt'), 'appblips-previews/p1/notes/a.txt');
  assert.equal(rootPath('p1', ''), 'appblips-previews/p1');
  for (const bad of ['/etc/passwd', '~/Desktop/x', '../p2/a.txt', 'a/../../b', '..\\p2']) {
    assert.throws(() => rootPath('p1', bad), /inside your app/, bad);
  }
  assert.throws(() => rootPath('p1', '.', { allowRoot: false }), /Name a file/);
  assert.throws(() => rootPath('p1', 42), /must be text/);
});

test('Puter errors become one friendly shape', () => {
  assert.equal(toPuterError({ error: { code: 'insufficient_funds', message: 'x' } }).code, 'insufficient_funds');
  assert.match(toPuterError({ error: { code: 'insufficient_funds' } }).message, /free allowance/);
  assert.equal(toPuterError({ error: 'popup_blocked', msg: 'x' }).code, 'popup_blocked');
  assert.equal(toPuterError(new Error('boom')).message, 'boom');
});

test('the host only runs allow-listed methods', async () => {
  const host = createPuterHost({ loadPuter: async () => fakePuter() });
  for (const method of ['kv.flush', 'auth.signOut', 'fs.copy', 'constructor', '__proto__', 'ai.chat.call']) {
    await assert.rejects(host.handleCall({ projectId: 'p1', method, args: [] }), (err) => err.code === 'unsupported', method);
  }
  await assert.rejects(host.handleCall({ projectId: 'p1', method: 'kv.get', args: [1, 2, 3, 4, 5] }), /Too many/);
  assert.ok(!PUTER_METHODS.includes('auth.signOut'));
});

test('each project has its own keys and files', async () => {
  const puter = fakePuter();
  const host = createPuterHost({ loadPuter: async () => puter });
  const call = (projectId, method, ...args) => host.handleCall({ projectId, method, args });

  await call('p1', 'kv.set', 'notes:1', 'one');
  await call('p2', 'kv.set', 'notes:1', 'two');
  assert.equal(await call('p1', 'kv.get', 'notes:1'), 'one');
  assert.equal(await call('p2', 'kv.get', 'notes:1'), 'two');
  assert.deepEqual(await call('p1', 'kv.get', ['notes:1', 'missing']), ['one', null]);
  assert.deepEqual(await call('p1', 'kv.list', 'notes:*'), ['notes:1']);
  assert.deepEqual(await call('p1', 'kv.list', 'notes:*', true), [{ key: 'notes:1', value: 'one' }]);
  assert.deepEqual(await call('p1', 'kv.list'), ['notes:1']);
  assert.equal(await call('p1', 'kv.incr', 'count'), 1);
  assert.equal(await call('p1', 'kv.incr', 'count', 5), 6);
  assert.ok([...puter.store.keys()].every((k) => k.startsWith('appblips:p1:') || k.startsWith('appblips:p2:')));
  // Odd project ids can't break out of their prefix or folder.
  await call('../../x', 'kv.set', 'k', 1);
  assert.ok(puter.store.has('appblips:x:k'));

  const item = await call('p1', 'fs.write', 'notes/a.txt', 'hello');
  assert.deepEqual(item, { name: 'a.txt', path: 'notes/a.txt', is_dir: false, size: 5, created: null, modified: null, type: null });
  assert.equal(puter.calls.find(([name]) => name === 'fs.write')[2].createMissingParents, true);
  assert.equal(await (await call('p1', 'fs.read', 'notes/a.txt')).text(), 'hello');
  await assert.rejects(call('p2', 'fs.read', 'notes/a.txt'), (err) => err.code === 'subject_does_not_exist');
  assert.deepEqual((await call('p1', 'fs.readdir', 'notes')).map((f) => f.path), ['notes/a.txt']);
  assert.deepEqual(await call('p3', 'fs.readdir', ''), [], 'a project with no files yet lists nothing');
  await assert.rejects(call('p1', 'fs.read', '../p2/notes/a.txt'), (err) => err.code === 'invalid');
  await assert.rejects(call('p1', 'fs.delete', ''), (err) => err.code === 'invalid', 'the project folder itself can’t be deleted');
  assert.equal(await call('p1', 'fs.getReadURL', 'notes/a.txt'), 'https://puter.example/read/appblips-previews/p1/notes/a.txt');
  assert.equal(await call('p1', 'fs.delete', ['notes/a.txt']), true);
  assert.equal(puter.files.size, 0);

  // A page can't send AI output to a path of its choosing, or read a Puter path.
  await call('p1', 'ai.txt2img', 'a cat', { puter_output_path: '/ray/Desktop/x.png', model: 'm' });
  assert.deepEqual(puter.calls.find(([name]) => name === 'txt2img')[2], { model: 'm' });
  await assert.rejects(call('p1', 'ai.img2txt', '~/Documents/private.png'), (err) => err.code === 'invalid');
  assert.equal(await call('p1', 'ai.img2txt', 'https://example.com/a.png'), 'some text');

  // The page learns the user name, nothing more.
  assert.deepEqual(await call('p1', 'auth.getUser'), { username: 'ray', uuid: 'u-1', is_temp: false });
});

test('signed out: the first call waits for the builder to sign in, or fails if they decline', async () => {
  const puter = fakePuter({ signedIn: false });
  const host = createPuterHost({ loadPuter: async () => puter });
  let changes = 0;
  host.onChange(() => { changes += 1; });

  const pending = host.handleCall({ projectId: 'p1', method: 'kv.set', args: ['a', 1] });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(host.hasSignInRequest(), true);
  assert.ok(puter.store.size === 0, 'nothing runs before sign-in');
  await host.answerSignIn(true);
  assert.equal(await pending, true);
  assert.equal(host.isSignedIn(), true);
  assert.ok(changes >= 2);

  puter.state.signedIn = false;
  const declined = host.handleCall({ projectId: 'p1', method: 'kv.get', args: ['a'] });
  await new Promise((r) => setTimeout(r, 0));
  await host.answerSignIn(false);
  await assert.rejects(declined, (err) => err.code === 'signin-cancelled');
});

// The stand-in in a bare context whose parent is the host, as in the preview.
const connect = (host, { projectId = 'p1', token = 'tok' } = {}) => {
  const html = injectPuterShim(PAGE, { token, signedIn: true });
  const source = html.match(/<script data-appblips-puter>([\s\S]*?)<\/script>/)[1];
  const listeners = [];
  const context = {
    Blob, ArrayBuffer, Promise, Symbol, JSON, Object, Array, String, Error,
    URL: { createObjectURL: () => 'blob:frame' },
    Image: class { constructor() { this.src = ''; } },
    Audio: class { constructor(src) { this.src = src; } },
    document: { body: null, addEventListener() {} },
    addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); },
  };
  context.window = context;
  const deliver = (data) => setTimeout(() => listeners.forEach((fn) => fn({ source: context.parent, data })), 0);
  context.parent = {
    postMessage: (message) => {
      assert.equal(message.__orion, BRIDGE_CHANNEL);
      assert.equal(message.token, token);
      assert.equal(message.type, 'puter-call');
      const { id, method, args } = structuredClone(message.payload);
      const reply = (type, payload) => deliver({ __orion: BRIDGE_CHANNEL, token, type, payload: { id, ...payload } });
      host.handleCall({ projectId, method, args, onChunk: (chunk) => reply('puter-chunk', { chunk }) })
        .then((value) => reply('puter-result', { value, signedIn: true }), (err) => reply('puter-result', { error: { code: err.code, message: err.message } }));
    },
  };
  vm.runInNewContext(source, context);
  return context.puter;
};

test('the stand-in and the host work end to end', async () => {
  const fake = fakePuter();
  const puter = connect(createPuterHost({ loadPuter: async () => fake }));

  const reply = await puter.ai.chat('Hi', { model: 'gpt-x', signal: { aborted: false }, onUpdate() {} });
  assert.equal(reply.message.content, 'Hello');
  assert.equal(String(reply), 'Hello');
  assert.deepEqual(fake.calls[0][2], { model: 'gpt-x' }, 'the signal and callbacks stay in the page');

  let text = '';
  for await (const part of await puter.ai.chat([{ role: 'user', content: 'Hi' }], { stream: true })) {
    if (part.type === 'text') text += part.text;
  }
  assert.equal(text, 'Hello');

  assert.equal((await puter.ai.txt2img('a cat')).src, 'https://img.example/cat.png');
  assert.equal((await puter.ai.txt2speech('hello')).src, 'data:audio/mp3;base64,AAAA');

  assert.equal(await puter.kv.set('k', { a: 1 }), true);
  assert.deepEqual(await puter.kv.get('k'), { a: 1 });
  assert.ok(fake.store.has('appblips:p1:k'));

  await puter.fs.write('a.txt', 'hi');
  assert.equal(await (await puter.fs.read('a.txt')).text(), 'hi');

  await assert.rejects(puter.fs.read('/etc/passwd'), (err) => err.code === 'invalid' && /inside your app/.test(err.message));
  assert.equal(puter.auth.isSignedIn(), true);
  assert.equal((await puter.auth.getUser()).username, 'ray');
  await puter.auth.signOut();
  assert.equal(fake.state.signedIn, true, 'a page can’t sign the builder out');
  // A method the stand-in lacks still gets a clear answer, not a TypeError.
  await assert.rejects(puter.ai.listModels(), (err) => err.code === 'unsupported' && /isn’t available/.test(err.message));
  await assert.rejects(puter.ui.alert('x'), (err) => err.code === 'unsupported');
});

test('a streamed chat that fails rejects the loop', async () => {
  const fake = fakePuter();
  fake.ai.chat = async () => (async function* broken() {
    yield { type: 'text', text: 'Hi' };
    throw { error: { code: 'too_many_requests' } };
  })();
  const puter = connect(createPuterHost({ loadPuter: async () => fake }));
  const parts = [];
  await assert.rejects(async () => {
    for await (const part of await puter.ai.chat('x', { stream: true })) parts.push(part.text);
  }, (err) => err.code === 'too_many_requests' && /busy/.test(err.message));
  assert.deepEqual(parts, ['Hi']);
});

test('offline (the preview for now): calls show a notice in the page, fail, and post nothing', async () => {
  const html = injectPuterShim(PAGE, { token: 't', offline: true, signedIn: true });
  const source = html.match(/<script data-appblips-puter>([\s\S]*?)<\/script>/)[1];
  const added = [];
  const node = () => ({ style: {}, children: [], setAttribute() {}, appendChild(c) { this.children.push(c); }, remove() { added.splice(added.indexOf(this), 1); }, focus() {} });
  const document = { body: { appendChild: (el) => added.push(el) }, createElement: node };
  const context = { Promise, Symbol, Object, Array, String, Error, Blob, ArrayBuffer, Proxy, document, addEventListener() {}, parent: { postMessage: () => assert.fail('no message') } };
  context.window = context;
  vm.runInNewContext(source, context);
  const { puter } = context;
  await assert.rejects(puter.ai.chat('hi'), (err) => err.code === 'preview' && /published site/.test(err.message));
  assert.equal(added.length, 1, 'the notice is shown');
  await assert.rejects(puter.kv.get('a'));
  assert.equal(added.length, 1, 'only one notice at a time');
  const ok = added[0].children[0].children[2];
  assert.equal(ok.textContent, 'OK');
  ok.onclick();
  assert.equal(added.length, 0, 'OK closes it');
  await assert.rejects(puter.auth.signIn());
  assert.equal(added.length, 1);
  assert.equal(puter.auth.isSignedIn(), false);
  // The page can't replace the stand-in with the real Puter.js.
  context.puter = { fake: true };
  assert.equal(context.puter, puter);
});
