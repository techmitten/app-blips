// Where a custom domain stands on its way to going live, from one
// /api/surge/domain snapshot (domainStatus in electron/server/surgeApi.js),
// for the Publish window's checklist (components/CustomDomainStatus.jsx).
// Kept apart from the component so the rules are testable
// (testing/testDomainStatus.js).

// Surge gets a certificate by itself once it sees the DNS. AppBlips only
// nudges it (PUT /<domain>/encrypt) when it's still waiting this long after
// the DNS was first right: once automatically, then when the user asks, at
// most every CERT_COOLDOWN_MS. Each failed try counts against Let's Encrypt's
// limit of 5 failures per domain an hour, which then locks the domain out
// for an hour.
export const CERT_WAIT_MS = 10 * 60_000;
export const CERT_COOLDOWN_MS = 30 * 60_000;

// The checklist, in order.
export const STEPS = ['upload', 'dns', 'surge', 'cert', 'live'];

// { live, stage, label }: `stage` is the step the domain is waiting on:
//   checking  no snapshot yet
//   dns       the DNS doesn't point at Surge (or Cloudflare's proxy is on)
//   surge     the DNS is right but Surge hasn't seen it yet
//   verify    Surge holds the domain until the account's email is verified
//   cert      Surge is getting the certificate
//   live      it answers over HTTPS from Surge
// Surge's own word wins over the public DNS lookup when they disagree:
// resolvers can hold an old answer for a while after a change.
export function domainProgress(snapshot) {
  if (!snapshot) return { live: false, stage: 'checking', label: 'Checking…' };
  const dns = snapshot.dns?.status || 'unknown';
  const surge = snapshot.surge?.status || '';
  const dnsOk = dns === 'connected';
  if (dns !== 'proxied' && (snapshot.https?.ok === true || surge === 'live')) return { live: true, stage: 'live', label: 'Live' };
  const seen = surge === 'securing';
  if (!dnsOk && !seen) return { live: false, stage: 'dns', label: 'Waiting for DNS' };
  if (surge === 'ready') return { live: false, stage: 'verify', label: 'Verify your email' };
  if (surge === 'waiting') return { live: false, stage: 'surge', label: 'Waiting for Surge' };
  return { live: false, stage: 'cert', label: 'Getting HTTPS' };
}

// Each step's state for the checklist: 'done', 'active', 'problem' or 'todo'.
// The step being waited on is a 'problem' when the user has to fix
// something (a proxied or mixed record, an unverified email).
export function stepStates(snapshot) {
  const { stage } = domainProgress(snapshot);
  if (stage === 'live') return Object.fromEntries(STEPS.map((step) => [step, 'done']));
  const current = { checking: 'dns', dns: 'dns', surge: 'surge', verify: 'surge', cert: 'cert' }[stage];
  const index = STEPS.indexOf(current);
  const dns = snapshot?.dns?.status;
  const problem = stage === 'verify' || (stage === 'dns' && (dns === 'proxied' || dns === 'mixed'));
  return Object.fromEntries(STEPS.map((step, i) => [
    step,
    i < index ? 'done' : i > index ? 'todo' : problem ? 'problem' : 'active',
  ]));
}

// Whether to ask Surge for the certificate, from the snapshot and what was
// remembered for the domain (loadCertState in lib/surge.js):
//   show         the "ask again" control applies (stuck for CERT_WAIT_MS)
//   auto         ask now, by itself: only once per domain, ever
//   availableAt  when asking is allowed again (0: now)
//   lockedUntil  Let's Encrypt refuses until then (0: not locked)
export function certRequestPlan(snapshot, certState, now) {
  const { stage } = domainProgress(snapshot);
  const lockedUntil = certState.retryAt > now ? certState.retryAt : 0;
  const cooldownEnd = certState.lastRequestAt ? certState.lastRequestAt + CERT_COOLDOWN_MS : 0;
  const availableAt = Math.max(lockedUntil, cooldownEnd > now ? cooldownEnd : 0);
  const show = stage === 'cert' && certState.connectedAt > 0 && now - certState.connectedAt >= CERT_WAIT_MS;
  const auto = show && !certState.lastRequestAt && !lockedUntil
    && snapshot?.surge?.status === 'securing' && snapshot?.cert?.issued !== true;
  return { show, auto, availableAt, lockedUntil };
}

// "under a minute", "5 minutes", "about 2 hours": how long a cached record
// may last (a DNS TTL, in seconds).
export function formatWait(seconds) {
  if (!Number.isFinite(seconds) || seconds < 60) return 'under a minute';
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} hour${hours === 1 ? '' : 's'}`;
}

// "just now", "12 s ago", "3 min ago".
export function formatAgo(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds} s ago`;
  return `${Math.round(seconds / 60)} min ago`;
}

// A time later today (or another day) in the user's own clock: "3:42 PM".
export const formatClock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
