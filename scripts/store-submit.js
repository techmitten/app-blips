// Sends a built Microsoft Store package to Partner Center for certification,
// using the Microsoft Store submission API. The submission is set to publish
// IMMEDIATELY: once Microsoft has certified it, it goes live in the Store by
// itself, with no "Publish now" click in Partner Center. (It has to be
// committed: Partner Center ignores the API's changes to a submission until
// then, so an uncommitted one still shows the previous version.)
//
// Usage:
//   node scripts/store-submit.js --check
//       Only sign in and check that a new draft can be made (no submission
//       is pending). Run before building, so a release stops early.
//   node scripts/store-submit.js <package.zip> <package-file-name-inside-the-zip>
//       Create the submission, upload the package, commit it and wait until
//       Microsoft has accepted the package. In GitHub Actions the submission's
//       id is written to the step output `submission` as soon as it exists.
//   node scripts/store-submit.js --delete <submission-id>
//       Delete a submission this script made (when a later release step
//       failed).
// Env:   MSSTORE_TENANT_ID, MSSTORE_CLIENT_ID, MSSTORE_CLIENT_SECRET,
//        MSSTORE_PRODUCT_ID (the app's Store ID)
// Run by the store and publish jobs in .github/workflows/desktop.yml.
import { appendFile, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms))

export class ApiError extends Error {
  constructor(message, { status = 0, transient = false } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.transient = transient
  }
}

export function isTransientStatus(status) {
  return status === 408 || status === 429 || (status >= 500 && status < 600)
}

export function retryDelayMs(res, attempt, baseMs = 2_000, maxMs = 30_000) {
  const header = res?.headers?.get?.('retry-after')
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1_000, maxMs)
    const dateMs = Date.parse(header) - Date.now()
    if (Number.isFinite(dateMs) && dateMs > 0) return Math.min(dateMs, maxMs)
  }
  return Math.min(baseMs * 2 ** attempt, maxMs)
}

export async function fetchWithRetry(
  url,
  init = {},
  { retries = 4, baseDelayMs = 2_000, maxDelayMs = 30_000, fetchFn = fetch, sleep = defaultSleep, warn = console.warn } = {},
) {
  const method = init.method || 'GET'
  for (let attempt = 0; ; attempt++) {
    let res
    try {
      res = await fetchFn(url, init)
    } catch (err) {
      if (attempt >= retries) throw err
      const delay = retryDelayMs(null, attempt, baseDelayMs, maxDelayMs)
      warn(`Network error on ${method} (${err.message}), retrying in ${Math.ceil(delay / 1_000)}s (${attempt + 1}/${retries})…`)
      await sleep(delay)
      continue
    }
    if (res.ok || !isTransientStatus(res.status) || attempt >= retries) return res
    await res.text().catch(() => '')
    const delay = retryDelayMs(res, attempt, baseDelayMs, maxDelayMs)
    warn(`Transient HTTP ${res.status} on ${method}, retrying in ${Math.ceil(delay / 1_000)}s (${attempt + 1}/${retries})…`)
    await sleep(delay)
  }
}

export async function apiRequest(apiBase, method, url, token, body, options = {}) {
  const defaultRetries = ['GET', 'PUT', 'DELETE'].includes(method) ? 4 : 0
  let res
  try {
    res = await fetchWithRetry(
      url,
      {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      },
      { ...options, retries: options.retries ?? defaultRetries },
    )
  } catch (err) {
    throw new ApiError(`${method} ${url.replace(apiBase, '…')} failed: ${err.message}`, { transient: true })
  }
  const text = await res.text()
  if (!res.ok) {
    throw new ApiError(`${method} ${url.replace(apiBase, '…')} failed (${res.status}): ${text}`, {
      status: res.status,
      transient: isTransientStatus(res.status),
    })
  }
  return text ? JSON.parse(text) : {}
}

export async function waitForSubmission({
  apiBase,
  submissionId,
  token,
  timeoutMs = 30 * 60_000,
  pollIntervalMs = 20_000,
  maxConsecutiveErrors = 5,
  request = apiRequest,
  sleep = defaultSleep,
  log = console.log,
  warn = console.warn,
  now = Date.now,
}) {
  const deadline = now() + timeoutMs
  let status
  let consecutiveErrors = 0
  for (;;) {
    try {
      status = await request(apiBase, 'GET', `${apiBase}/submissions/${submissionId}/status`, token)
      consecutiveErrors = 0
    } catch (err) {
      if (err instanceof ApiError && err.transient) {
        consecutiveErrors += 1
        if (consecutiveErrors >= maxConsecutiveErrors || now() > deadline) throw err
        warn(`Partner Center status check hit a temporary error (${consecutiveErrors}/${maxConsecutiveErrors}); will keep waiting: ${err.message}`)
        await sleep(pollIntervalMs)
        continue
      }
      throw err
    }
    if (status.status?.endsWith('Failed')) {
      const errors = (status.statusDetails?.errors || []).map((e) => `${e.code}: ${e.details}`).join('; ')
      throw new ApiError(`Partner Center rejected the submission (${status.status}): ${errors || 'no details given'}`)
    }
    if (!['CommitStarted', 'PreProcessing'].includes(status.status)) return status
    if (now() > deadline) {
      log(`Still ${status.status} after 30 minutes; not waiting longer. Check Partner Center → AppBlips.`)
      return status
    }
    await sleep(pollIntervalMs)
  }
}

function die(msg) {
  console.error(`\nStopped: ${msg}`)
  process.exit(1)
}

async function main() {
  const args = process.argv.slice(2)
  const { MSSTORE_TENANT_ID, MSSTORE_CLIENT_ID, MSSTORE_CLIENT_SECRET, MSSTORE_PRODUCT_ID } = process.env

  const mode = args[0] === '--check' ? 'check' : args[0] === '--delete' ? 'delete' : 'upload'
  if (mode === 'delete' && !args[1]) die('Usage: node scripts/store-submit.js --delete <submission-id>')
  if (mode === 'upload' && (!args[0] || !args[1])) die('Usage: node scripts/store-submit.js <package.zip> <file-name-in-zip>')
  for (const [k, v] of Object.entries({ MSSTORE_TENANT_ID, MSSTORE_CLIENT_ID, MSSTORE_CLIENT_SECRET, MSSTORE_PRODUCT_ID })) {
    if (!v) die(`${k} is not set.`)
  }

  const API = `https://manage.devcenter.microsoft.com/v1.0/my/applications/${MSSTORE_PRODUCT_ID}`
  const api = (method, url, token, body) => apiRequest(API, method, url, token, body)

  // 1. Token
  const tokenRes = await fetchWithRetry(
    `https://login.microsoftonline.com/${MSSTORE_TENANT_ID}/oauth2/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: MSSTORE_CLIENT_ID,
        client_secret: MSSTORE_CLIENT_SECRET,
        resource: 'https://manage.devcenter.microsoft.com',
      }),
    },
  )
  if (!tokenRes.ok) die(`Could not sign in to Partner Center (${tokenRes.status}): ${await tokenRes.text()}`)
  const { access_token: token } = await tokenRes.json()

  if (mode === 'delete') {
    await api('DELETE', `${API}/submissions/${args[1]}`, token)
    console.log(`Deleted draft submission ${args[1]}`)
    process.exit(0)
  }

  // 2. Don't touch an existing pending submission: it may be in certification
  // (it goes live by itself when that passes) or hold unsaved edits made in
  // Partner Center.
  const app = await api('GET', API, token)
  if (app.pendingApplicationSubmission) {
    die(
      `AppBlips already has a pending submission (id ${app.pendingApplicationSubmission.id}). ` +
        'It is probably still in certification: wait for it to go live, or delete it in Partner Center → AppBlips, then run this again.',
    )
  }
  if (mode === 'check') {
    console.log('Partner Center is ready for a new submission.')
    process.exit(0)
  }

  const [zipPath, fileName] = args

  // 3. New submission, copied from the last published one. Its id goes out
  // straight away, so a failure from here on can still delete it.
  const sub = await api('POST', `${API}/submissions`, token)
  console.log(`Created submission ${sub.id}`)
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `submission=${sub.id}\n`)

  // 4. Replace the packages (remove the old ones, add the new one) and publish
  // straight away once certification passes.
  for (const pkg of sub.applicationPackages || []) pkg.fileStatus = 'PendingDelete'
  sub.applicationPackages = [
    ...(sub.applicationPackages || []),
    { fileName, fileStatus: 'PendingUpload', minimumDirectXVersion: 'None', minimumSystemRam: 'None' },
  ]
  sub.targetPublishMode = 'Immediate'
  await api('PUT', `${API}/submissions/${sub.id}`, token, sub)

  // 5. Upload the zipped package to the blob URL from step 3
  const zip = await readFile(zipPath)
  const up = await fetchWithRetry(sub.fileUploadUrl, {
    method: 'PUT',
    headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Length': String(zip.length) },
    body: zip,
  })
  if (!up.ok) die(`Uploading the package failed (${up.status}): ${await up.text()}`)
  console.log(`Uploaded ${fileName} (${(zip.length / 1048576).toFixed(1)} MB)`)

  // 6. Commit, then wait until Microsoft has taken the package. A rejected
  // package (wrong identity, version not higher than the Store's, ...) fails
  // here, while the release can still be stopped.
  await api('POST', `${API}/submissions/${sub.id}/commit`, token)
  console.log('Committed. Waiting for Partner Center to process the package…')
  const status = await waitForSubmission({ apiBase: API, submissionId: sub.id, token })
  console.log(`Status: ${status.status}`)
  console.log('\nSent for certification (usually a few days). It goes live in the Store automatically when it passes.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => die(err instanceof Error ? err.message : String(err)))
}
