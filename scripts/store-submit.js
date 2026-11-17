// Uploads a built Microsoft Store package to Partner Center as a DRAFT
// submission, using the Microsoft Store submission API. It never commits the
// submission: you review the draft and click "Submit to the Store" yourself.
//
// Usage:
//   node scripts/store-submit.js --check
//       Only sign in and check that a new draft can be made (no submission
//       is pending). Run before building, so a release stops early.
//   node scripts/store-submit.js <package.zip> <package-file-name-inside-the-zip>
//       Create the draft and upload the package. In GitHub Actions the draft's
//       id is written to the step output `submission` as soon as it exists.
//   node scripts/store-submit.js --delete <submission-id>
//       Delete a draft this script made (when a later release step failed).
// Env:   MSSTORE_TENANT_ID, MSSTORE_CLIENT_ID, MSSTORE_CLIENT_SECRET,
//        MSSTORE_PRODUCT_ID (the app's Store ID)
// Run by the store and publish jobs in .github/workflows/desktop.yml.
import { appendFile, readFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const { MSSTORE_TENANT_ID, MSSTORE_CLIENT_ID, MSSTORE_CLIENT_SECRET, MSSTORE_PRODUCT_ID } = process.env

function die(msg) {
  console.error(`\nStopped: ${msg}`)
  process.exit(1)
}

const mode = args[0] === '--check' ? 'check' : args[0] === '--delete' ? 'delete' : 'upload'
if (mode === 'delete' && !args[1]) die('Usage: node scripts/store-submit.js --delete <submission-id>')
if (mode === 'upload' && (!args[0] || !args[1])) die('Usage: node scripts/store-submit.js <package.zip> <file-name-in-zip>')
for (const [k, v] of Object.entries({ MSSTORE_TENANT_ID, MSSTORE_CLIENT_ID, MSSTORE_CLIENT_SECRET, MSSTORE_PRODUCT_ID })) {
  if (!v) die(`${k} is not set.`)
}

const API = `https://manage.devcenter.microsoft.com/v1.0/my/applications/${MSSTORE_PRODUCT_ID}`

async function api(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) die(`${method} ${url.replace(API, '…')} failed (${res.status}): ${text}`)
  return text ? JSON.parse(text) : {}
}

// 1. Token
const tokenRes = await fetch(`https://login.microsoftonline.com/${MSSTORE_TENANT_ID}/oauth2/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: MSSTORE_CLIENT_ID,
    client_secret: MSSTORE_CLIENT_SECRET,
    resource: 'https://manage.devcenter.microsoft.com',
  }),
})
if (!tokenRes.ok) die(`Could not sign in to Partner Center (${tokenRes.status}): ${await tokenRes.text()}`)
const { access_token: token } = await tokenRes.json()

if (mode === 'delete') {
  await api('DELETE', `${API}/submissions/${args[1]}`, token)
  console.log(`Deleted draft submission ${args[1]}`)
  process.exit(0)
}

// 2. Don't touch an existing pending submission: it may be in certification
// or hold unsaved edits made in Partner Center.
const app = await api('GET', API, token)
if (app.pendingApplicationSubmission) {
  die(
    `AppBlips already has a pending submission (id ${app.pendingApplicationSubmission.id}). ` +
      'Open Partner Center → AppBlips, submit or delete it, then run this again.',
  )
}
if (mode === 'check') {
  console.log('Partner Center is ready for a new draft.')
  process.exit(0)
}

const [zipPath, fileName] = args

// 3. New draft, copied from the last published submission. Its id goes out
// straight away, so a failure from here on can still delete it.
const sub = await api('POST', `${API}/submissions`, token)
console.log(`Created draft submission ${sub.id}`)
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `submission=${sub.id}\n`)

// 4. Replace the packages: remove the old ones, add the new one
for (const pkg of sub.applicationPackages || []) pkg.fileStatus = 'PendingDelete'
sub.applicationPackages = [
  ...(sub.applicationPackages || []),
  { fileName, fileStatus: 'PendingUpload', minimumDirectXVersion: 'None', minimumSystemRam: 'None' },
]
await api('PUT', `${API}/submissions/${sub.id}`, token, sub)

// 5. Upload the zipped package to the blob URL from step 3
const zip = await readFile(zipPath)
const up = await fetch(sub.fileUploadUrl, {
  method: 'PUT',
  headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Length': String(zip.length) },
  body: zip,
})
if (!up.ok) die(`Uploading the package failed (${up.status}): ${await up.text()}`)
console.log(`Uploaded ${fileName} (${(zip.length / 1048576).toFixed(1)} MB)`)

// 6. Left as a draft on purpose.
console.log('\nDraft is ready. Open Partner Center → AppBlips, check it and click "Submit to the Store".')
