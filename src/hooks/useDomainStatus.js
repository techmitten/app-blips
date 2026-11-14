import { useEffect, useRef, useState } from 'react';
import { loadCertState, saveCertState, surgeDomainStatus, surgeEncrypt } from '../lib/surge';
import { certRequestPlan, domainProgress } from '../lib/domainStatus';

// Checks a lot at first, when DNS changes usually land, then settles down.
const FAST_MS = 20_000;
const SLOW_MS = 60_000;
const FAST_FOR_MS = 10 * 60_000;

// Watches a custom domain while the Publish window shows it, until it's live
// (components/CustomDomainStatus.jsx). Every check is one read-only
// /api/surge/domain call. Checks pause while the window is in the
// background and stop when `host` is '' (the window moved on or closed).
// It asks Surge for the certificate only as certRequestPlan allows (once by
// itself after a long wait, then when the user asks), and remembers that
// per domain (loadCertState), so reopening the window doesn't ask again.
//
// Returns { snapshot, progress, failed, checking, checkedAt, nextAt, paused,
//           now, certState, plan, request, checkNow, requestCert }
//   snapshot  the latest reply (null before the first)
//   progress  domainProgress(snapshot)
//   failed    why the latest check failed, or ''
//   nextAt    when the next check runs (0: none planned)
//   paused    true while the window is in the background
//   now       the clock, ticking every second while not live (countdowns)
//   request   the certificate request: { status: 'idle' | 'requesting' |
//             'error' | 'issued', message }
export default function useDomainStatus(host) {
  // Everything is tagged with its host, so a reply for an older host is
  // never shown for a new one.
  const [data, setData] = useState({ host: '', snapshot: null, failed: '', checkedAt: 0, nextAt: 0, paused: false, checking: false });
  const [request, setRequest] = useState({ host: '', status: 'idle', message: '' });
  const [now, setNow] = useState(() => Date.now());
  const runRef = useRef(null);

  const current = data.host === host ? data : { host, snapshot: null, failed: '', checkedAt: 0, nextAt: 0, paused: false, checking: Boolean(host) };
  const currentRequest = request.host === host ? request : { host, status: 'idle', message: '' };
  const progress = domainProgress(current.snapshot);
  const certState = loadCertState(host);
  const plan = certRequestPlan(current.snapshot, certState, now);

  const requestCert = async () => {
    if (!host) return;
    setRequest({ host, status: 'requesting', message: '' });
    saveCertState(host, { lastRequestAt: Date.now() });
    const result = await surgeEncrypt(host);
    if (result.retryAt) saveCertState(host, { retryAt: result.retryAt });
    setRequest({ host, status: result.error ? 'error' : 'issued', message: result.error || '' });
    runRef.current?.();
  };
  // The latest requestCert for the polling loop, which outlives renders.
  const requestRef = useRef(requestCert);
  useEffect(() => { requestRef.current = requestCert; });

  useEffect(() => {
    if (!host) return undefined;
    let alive = true;
    let timer = 0;
    let busy = false;
    const started = Date.now();

    const run = async () => {
      clearTimeout(timer);
      if (!alive || busy) return;
      if (document.hidden) {
        setData((prev) => ({ ...(prev.host === host ? prev : { host, snapshot: null, failed: '', checkedAt: 0 }), nextAt: 0, paused: true, checking: false }));
        return;
      }
      busy = true;
      setData((prev) => ({ ...(prev.host === host ? prev : { host, snapshot: null, failed: '', checkedAt: 0 }), paused: false, checking: true }));
      const result = await surgeDomainStatus(host);
      busy = false;
      if (!alive) return;
      const at = Date.now();
      const snapshot = result.error ? null : result;
      const progressNow = domainProgress(snapshot);
      const wait = at - started < FAST_FOR_MS ? FAST_MS : SLOW_MS;
      const done = Boolean(snapshot) && progressNow.live;
      setData((prev) => ({
        host,
        snapshot: snapshot || (prev.host === host ? prev.snapshot : null),
        failed: result.error || '',
        checkedAt: at,
        nextAt: done ? 0 : at + wait,
        paused: false,
        checking: false,
      }));
      setNow(at);
      if (snapshot) {
        // Remember when the DNS was first right; the certificate wait counts
        // from then. Once live there's nothing left to remember.
        if (done) saveCertState(host, null);
        else if (progressNow.stage === 'dns') saveCertState(host, { connectedAt: 0 });
        else if (!loadCertState(host).connectedAt) saveCertState(host, { connectedAt: at });
        if (!done && certRequestPlan(snapshot, loadCertState(host), at).auto) requestRef.current();
      }
      if (!done) timer = setTimeout(run, wait);
    };
    runRef.current = run;
    const onVisibility = () => { if (!document.hidden) run(); };
    document.addEventListener('visibilitychange', onVisibility);
    timer = setTimeout(run, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      if (runRef.current === run) runRef.current = null;
    };
  }, [host]);

  // A clock for the countdowns ("next check in 12 s"), while there's
  // something to wait for.
  useEffect(() => {
    if (!host || progress.live) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [host, progress.live]);

  return {
    ...current,
    progress,
    now,
    certState,
    plan,
    request: currentRequest,
    checkNow: () => runRef.current?.(),
    requestCert,
  };
}
