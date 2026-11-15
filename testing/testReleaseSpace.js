import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = new URL('../scripts/push-space.sh', import.meta.url).pathname;

async function deploy(mode, extraEnv = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'appblips-space-test-'));
  try {
    // No real remote is contacted or mutated by these tests.
    await writeFile(join(dir, 'git'), `#!/usr/bin/env bash
if [ "$1" = remote ]; then exit 0; fi
if [ "$1" = rev-parse ]; then echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; exit 0; fi
case "$TEST_GIT_MODE" in
  hang) exec sleep 30 ;;
  fail) echo 'Authentication failed' >&2; exit 128 ;;
esac
printf '%s\\n' "$@"
printf 'prompts=%s askpass=%s interactive=%s\\n' "$GIT_TERMINAL_PROMPT" "$GIT_ASKPASS" "$GCM_INTERACTIVE"
if read -r unexpected; then echo 'stdin was not closed' >&2; exit 1; fi
`, { mode: 0o755 });
    try {
      const result = await run('bash', [script, 'v0.1.31'], {
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TEST_GIT_MODE: mode, HF_PUSH_TIMEOUT_SECONDS: '1', ...extraEnv },
        timeout: 10000,
      });
      return { ...result, code: 0 };
    } catch (err) {
      return { stdout: err.stdout, stderr: err.stderr, code: err.code };
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('Space deployment pushes the release commit with progress and no credential prompts', async () => {
  const result = await deploy('success');
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /push\n--progress\nspace\na{40}:refs\/heads\/master/);
  assert.match(result.stdout, /prompts=0 askpass=\/bin\/false interactive=never/);
  assert.match(result.stdout, /Space will rebuild/);
});

test('a stuck Space push exits at the deadline with a deployment-only retry', async () => {
  const result = await deploy('hang');
  assert.equal(result.code, 124, result.stderr);
  assert.match(result.stderr, /timed out after 1s/);
  assert.match(result.stderr, /bash scripts\/push-space.sh v0\.1\.31/);
  assert.match(result.stderr, /Do not rerun npm run release/);
  assert.doesNotMatch(result.stdout, /Space will rebuild/);
});

test('Space authentication failures retain the Git error and exit status', async () => {
  const result = await deploy('fail');
  assert.equal(result.code, 128);
  assert.match(result.stderr, /Authentication failed/);
  assert.match(result.stderr, /GitHub release is already prepared/);
});

test('Space timeout must be a positive integer', async () => {
  const result = await deploy('success', { HF_PUSH_TIMEOUT_SECONDS: '0' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /must be a positive integer/);
});
