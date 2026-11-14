// The custom domain checklist's rules (src/lib/domainStatus.js): which step
// a domain is waiting on, and when AppBlips may ask Surge for a certificate.
// Run: node testing/testDomainStatus.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CERT_COOLDOWN_MS, CERT_WAIT_MS, certRequestPlan, domainProgress, formatAgo, formatWait, stepStates } from '../src/lib/domainStatus.js';

// A /api/surge/domain snapshot with just the parts the rules read.
const snap = (dns, surge, extra = {}) => ({
  dns: { status: dns },
  surge: surge ? { status: surge } : null,
  https: { ok: false, via: null },
  cert: null,
  ...extra,
});

test('progress: DNS first, then Surge, then the certificate, then live', () => {
  assert.equal(domainProgress(null).stage, 'checking');
  assert.equal(domainProgress(snap('missing', 'waiting')).stage, 'dns');
  assert.equal(domainProgress(snap('connected', 'waiting')).stage, 'surge');
  assert.equal(domainProgress(snap('connected', 'securing')).stage, 'cert');
  assert.equal(domainProgress(snap('connected', 'ready')).stage, 'verify');
  // Signed out: Surge's side is unknown, so the wait is for HTTPS.
  assert.equal(domainProgress(snap('connected', null)).stage, 'cert');
  assert.equal(domainProgress(snap('connected', 'securing', { https: { ok: true, via: 'surge' } })).live, true);
  assert.equal(domainProgress(snap('connected', 'live')).live, true);
});

test('progress: Surge seeing the domain beats a stale public lookup; the proxy never counts as live', () => {
  assert.equal(domainProgress(snap('elsewhere', 'securing')).stage, 'cert');
  assert.equal(domainProgress(snap('proxied', 'live')).live, false);
  assert.equal(domainProgress(snap('proxied', 'waiting')).stage, 'dns');
  assert.equal(domainProgress(snap('missing', 'waiting')).label, 'Waiting for DNS');
});

test('steps: earlier ones done, the one being waited on active or a problem', () => {
  assert.deepEqual(stepStates(snap('missing', 'waiting')), { upload: 'done', dns: 'active', surge: 'todo', cert: 'todo', live: 'todo' });
  assert.equal(stepStates(snap('proxied', '')).dns, 'problem');
  assert.equal(stepStates(snap('mixed', '')).dns, 'problem');
  assert.deepEqual(stepStates(snap('connected', 'ready')), { upload: 'done', dns: 'done', surge: 'problem', cert: 'todo', live: 'todo' });
  assert.equal(stepStates(snap('connected', 'securing')).cert, 'active');
  assert.ok(Object.values(stepStates(snap('connected', 'live'))).every((state) => state === 'done'));
});

test('certificate requests: only after a long wait, once by itself, then rationed', () => {
  const now = 1_000_000_000;
  const securing = snap('connected', 'securing');
  const fresh = { connectedAt: now - 60_000, lastRequestAt: 0, retryAt: 0 };
  assert.deepEqual(certRequestPlan(securing, fresh, now), { show: false, auto: false, availableAt: 0, lockedUntil: 0 });
  const stuck = { ...fresh, connectedAt: now - CERT_WAIT_MS };
  assert.equal(certRequestPlan(securing, stuck, now).auto, true);
  // Surge hasn't seen the DNS yet: a certificate can't be had.
  assert.equal(certRequestPlan(snap('connected', 'waiting'), stuck, now).show, false);
  // Already issued: nothing to ask for.
  assert.equal(certRequestPlan(snap('connected', 'securing', { cert: { issued: true } }), stuck, now).auto, false);
  // Asked once: never again by itself, and by hand only after the cooldown.
  const asked = { ...stuck, lastRequestAt: now - 60_000 };
  const plan = certRequestPlan(securing, asked, now);
  assert.equal(plan.auto, false);
  assert.equal(plan.show, true);
  assert.equal(plan.availableAt, asked.lastRequestAt + CERT_COOLDOWN_MS);
  assert.equal(certRequestPlan(securing, { ...asked, lastRequestAt: now - CERT_COOLDOWN_MS }, now).availableAt, 0);
  // Let's Encrypt's lockout blocks both.
  const locked = certRequestPlan(securing, { ...stuck, retryAt: now + 3_600_000 }, now);
  assert.equal(locked.auto, false);
  assert.equal(locked.lockedUntil, now + 3_600_000);
  assert.equal(locked.availableAt, now + 3_600_000);
});

test('wording: cache times and check times', () => {
  assert.equal(formatWait(30), 'under a minute');
  assert.equal(formatWait(300), '5 minutes');
  assert.equal(formatWait(60), '1 minute');
  assert.equal(formatWait(14_400), 'about 4 hours');
  assert.equal(formatAgo(2_000), 'just now');
  assert.equal(formatAgo(12_000), '12 s ago');
  assert.equal(formatAgo(180_000), '3 min ago');
});
