// Run: node --test testing/testStoreSubmit.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, apiRequest, fetchWithRetry, retryDelayMs, waitForSubmission } from '../scripts/store-submit.js'

const noop = () => {}
const noSleep = async () => {}

function makeResponse(status, body = '', headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => headers[name.toLowerCase()] ?? null,
    },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }
}

test('fetchWithRetry retries transient 5xx/429 and network errors until success', async () => {
  const responses = [
    new Error('ECONNRESET'),
    makeResponse(500, '{"code":"InternalServerError"}'),
    makeResponse(429, 'rate limited', { 'retry-after': '1' }),
    makeResponse(200, { status: 'Certification' }),
  ]
  const sleeps = []
  let calls = 0
  const res = await fetchWithRetry(
    'https://example.test/status',
    { method: 'GET' },
    {
      retries: 4,
      baseDelayMs: 100,
      maxDelayMs: 5_000,
      fetchFn: async () => {
        const next = responses[calls++]
        if (next instanceof Error) throw next
        return next
      },
      sleep: async (ms) => sleeps.push(ms),
      warn: noop,
    },
  )
  assert.equal(res.status, 200)
  assert.equal(calls, 4)
  assert.deepEqual(sleeps, [100, 200, 1_000])
})

test('fetchWithRetry does not retry non-transient 4xx responses', async () => {
  let calls = 0
  const res = await fetchWithRetry(
    'https://example.test/status',
    { method: 'GET' },
    {
      retries: 4,
      fetchFn: async () => {
        calls += 1
        return makeResponse(404, 'not found')
      },
      sleep: noSleep,
      warn: noop,
    },
  )
  assert.equal(res.status, 404)
  assert.equal(calls, 1)
})

test('apiRequest retries GET on 500 by default, but does not retry POST by default', async () => {
  const apiBase = 'https://manage.devcenter.microsoft.com/v1.0/my/applications/123'
  let getCalls = 0
  const data = await apiRequest(apiBase, 'GET', `${apiBase}/submissions/1/status`, 'tok', undefined, {
    fetchFn: async () => {
      getCalls += 1
      return getCalls < 3 ? makeResponse(500, 'oops') : makeResponse(200, { status: 'PreProcessing' })
    },
    sleep: noSleep,
    warn: noop,
  })
  assert.deepEqual(data, { status: 'PreProcessing' })
  assert.equal(getCalls, 3)

  let postCalls = 0
  await assert.rejects(
    apiRequest(apiBase, 'POST', `${apiBase}/submissions`, 'tok', undefined, {
      fetchFn: async () => {
        postCalls += 1
        return makeResponse(500, 'oops')
      },
      sleep: noSleep,
      warn: noop,
    }),
    (err) => err instanceof ApiError && err.status === 500 && err.transient === true,
  )
  assert.equal(postCalls, 1)
})

test('waitForSubmission survives temporary 500 errors and finishes when Partner Center recovers', async () => {
  const apiBase = 'https://manage.devcenter.microsoft.com/v1.0/my/applications/123'
  const outcomes = [
    { status: 'CommitStarted' },
    new ApiError('GET …/submissions/42/status failed (500): UnknownInternalFailure', { status: 500, transient: true }),
    new ApiError('GET …/submissions/42/status failed (503): ServiceUnavailable', { status: 503, transient: true }),
    { status: 'PreProcessing' },
    { status: 'Certification' },
  ]
  let idx = 0
  const status = await waitForSubmission({
    apiBase,
    submissionId: '42',
    token: 'tok',
    request: async () => {
      const next = outcomes[idx++]
      if (next instanceof Error) throw next
      return next
    },
    sleep: noSleep,
    log: noop,
    warn: noop,
  })
  assert.equal(status.status, 'Certification')
  assert.equal(idx, 5)
})

test('waitForSubmission stops immediately on a Partner Center rejection or non-transient error', async () => {
  const apiBase = 'https://manage.devcenter.microsoft.com/v1.0/my/applications/123'
  await assert.rejects(
    waitForSubmission({
      apiBase,
      submissionId: '42',
      token: 'tok',
      request: async () => ({
        status: 'PreProcessingFailed',
        statusDetails: { errors: [{ code: 'InvalidPackage', details: 'Version must be higher' }] },
      }),
      sleep: noSleep,
      log: noop,
      warn: noop,
    }),
    /Partner Center rejected the submission \(PreProcessingFailed\): InvalidPackage: Version must be higher/,
  )

  let calls = 0
  await assert.rejects(
    waitForSubmission({
      apiBase,
      submissionId: '42',
      token: 'tok',
      request: async () => {
        calls += 1
        throw new ApiError('GET …/submissions/42/status failed (401): Unauthorized', { status: 401, transient: false })
      },
      sleep: noSleep,
      log: noop,
      warn: noop,
    }),
    /401/,
  )
  assert.equal(calls, 1)
})

test('waitForSubmission fails if transient errors persist beyond maxConsecutiveErrors', async () => {
  const apiBase = 'https://manage.devcenter.microsoft.com/v1.0/my/applications/123'
  let calls = 0
  await assert.rejects(
    waitForSubmission({
      apiBase,
      submissionId: '42',
      token: 'tok',
      maxConsecutiveErrors: 3,
      request: async () => {
        calls += 1
        throw new ApiError('GET …/submissions/42/status failed (500): InternalServerError', { status: 500, transient: true })
      },
      sleep: noSleep,
      log: noop,
      warn: noop,
    }),
    /500/,
  )
  assert.equal(calls, 3)
})

test('retryDelayMs respects Retry-After seconds and caps at maxMs', () => {
  assert.equal(retryDelayMs(makeResponse(429, '', { 'retry-after': '5' }), 0, 2_000, 30_000), 5_000)
  assert.equal(retryDelayMs(makeResponse(429, '', { 'retry-after': '120' }), 0, 2_000, 30_000), 30_000)
  assert.equal(retryDelayMs(makeResponse(500), 2, 2_000, 30_000), 8_000)
})
