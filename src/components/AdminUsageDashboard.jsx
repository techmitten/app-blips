import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  Clock,
  Copy,
  KeyRound,
  LogIn,
  LogOut,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Users,
} from 'lucide-react';
import { useFreeSignIn } from '../hooks/useFreeSignIn';
import { freeSignInHeaders } from '../lib/freeSignIn';

const ADMIN_TOKEN_KEY = 'appblips-admin-usage-token';
const AUTO_REFRESH_MS = 30_000;

const FLAG_LABELS = {
  blocked: 'Blocked',
  repeated_rate_limit: 'Repeated rate limits',
  rate_limit_hits: 'Rate-limit hits',
  high_request_rate: 'High req/hr',
  elevated_request_rate: 'Elevated req/hr',
  post_cap_hammering: 'Post-cap hammering',
};

const EVENT_STYLES = {
  blocked: { label: 'Blocked', cls: 'bg-red-500/15 text-red-700 dark:text-red-300' },
  auto_block: { label: 'Auto-blocked', cls: 'bg-red-500/15 text-red-700 dark:text-red-300' },
  admin_block: { label: 'Admin block', cls: 'bg-red-500/15 text-red-700 dark:text-red-300' },
  admin_unblock: { label: 'Unblocked', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  admin_pause: { label: 'Paused', cls: 'bg-red-500/15 text-red-700 dark:text-red-300' },
  admin_resume: { label: 'Resumed', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  admin_auto_on: { label: 'Auto-block ON', cls: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' },
  admin_auto_off: { label: 'Manual mode', cls: 'bg-slate-500/15 text-slate-700 dark:text-slate-300' },
  hourly_rate_limit: { label: 'Hourly cap', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  minute_rate_limit: { label: 'Minute cap', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  message_gap: { label: 'Rapid-fire', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  concurrency_limit: { label: 'Concurrency', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  user_token_cap: { label: 'User token cap', cls: 'bg-orange-500/15 text-orange-700 dark:text-orange-300' },
  site_token_cap: { label: 'Site token cap', cls: 'bg-red-500/15 text-red-700 dark:text-red-300' },
};

const formatNumber = (n) => (Number.isFinite(n) ? n.toLocaleString() : '—');

const formatCompact = (n) => {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
};

const formatRelativeTime = (iso) => {
  if (!iso) return '—';
  const diffSec = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ${diffMin % 60}m ago`;
};

const formatResetCountdown = (iso) => {
  if (!iso) return '—';
  const diffMs = Math.max(0, Date.parse(iso) - Date.now());
  const totalMin = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hours}h ${mins}m`;
};

const formatExpiry = (iso) => {
  if (!iso) return 'Indefinite';
  const diffMs = Date.parse(iso) - Date.now();
  if (diffMs <= 0) return 'Expired';
  const totalMin = Math.ceil(diffMs / 60_000);
  if (totalMin < 60) return `in ${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  if (hours < 48) return `in ${hours}h`;
  return `in ${Math.ceil(hours / 24)}d`;
};

const barTone = (pct, hitLimit) => {
  if (hitLimit || (pct != null && pct >= 100)) return 'bg-red-500';
  if (pct != null && pct >= 80) return 'bg-amber-500';
  if (pct != null && pct >= 50) return 'bg-sky-500';
  return 'bg-emerald-500';
};

const riskBadge = (riskLevel, pct, hitLimit) => {
  if (riskLevel === 'blocked') {
    return { label: 'Blocked', cls: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30' };
  }
  if (riskLevel === 'high') {
    return { label: 'High risk', cls: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30' };
  }
  if (riskLevel === 'medium') {
    return { label: 'Medium risk', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' };
  }
  if (hitLimit || (pct != null && pct >= 100)) {
    return { label: 'At limit', cls: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30' };
  }
  if (pct != null && pct >= 80) {
    return { label: 'Near limit', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' };
  }
  return { label: 'Healthy', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' };
};

const readSessionToken = () => {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch {
    return '';
  }
};

const writeSessionToken = (token) => {
  try {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch { /* sessionStorage unavailable */ }
};

export default function AdminUsageDashboard() {
  const { state: signInState, busy: authBusy, signIn, signOut } = useFreeSignIn();
  const [adminToken, setAdminToken] = useState(readSessionToken);
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenForm, setShowTokenForm] = useState(false);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'flagged' | '50' | '80' | '100'
  const [limit, setLimit] = useState(100);
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [copiedId, setCopiedId] = useState(false);

  // Prevention controls state
  const [busyAction, setBusyAction] = useState(false);
  const [blockTarget, setBlockTarget] = useState(null); // visitor string for inline row block modal
  const [blockDuration, setBlockDuration] = useState(24);
  const [blockReason, setBlockReason] = useState('');
  const [manualVisitor, setManualVisitor] = useState('');
  const [manualDuration, setManualDuration] = useState(24);
  const [manualReason, setManualReason] = useState('');
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [autoBlockHoursInput, setAutoBlockHoursInput] = useState(24);

  const hasAuth = Boolean(adminToken || signInState?.signedIn);

  const getAuthHeaders = useCallback(async () => {
    if (adminToken) return { authorization: `Bearer ${adminToken}` };
    return freeSignInHeaders();
  }, [adminToken]);

  const fetchUsage = useCallback(async ({ silent = false } = {}) => {
    if (!adminToken && !signInState?.signedIn) return;
    if (!silent) setLoading(true);
    try {
      const headers = await getAuthHeaders();
      if (!headers.authorization) {
        setError({ status: 401, message: 'Sign in to view Free AI usage.' });
        setData(null);
        return;
      }
      const params = new URLSearchParams({ limit: String(limit) });
      if (filterMode === 'flagged') params.set('flagged', '1');
      else if (filterMode === '50' || filterMode === '80' || filterMode === '100') params.set('minPct', filterMode);

      const res = await fetch(`/api/admin/free-usage?${params.toString()}`, {
        headers,
        cache: 'no-store',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ status: res.status, message: body?.error || `Request failed (${res.status}).` });
        if (res.status === 401 || res.status === 403) setData(null);
        return;
      }
      setError(null);
      setData(body);
      setLastFetchedAt(new Date());
    } catch (err) {
      setError({ status: 0, message: err?.message || 'Could not reach the server.' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [adminToken, signInState?.signedIn, getAuthHeaders, limit, filterMode]);

  useEffect(() => {
    if (hasAuth) fetchUsage();
  }, [hasAuth, fetchUsage]);

  useEffect(() => {
    if (!hasAuth || !autoRefresh || error?.status === 401 || error?.status === 403 || error?.status === 503) {
      return undefined;
    }
    const id = setInterval(() => fetchUsage({ silent: true }), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [hasAuth, autoRefresh, error?.status, fetchUsage]);

  const postAdminAction = async (endpoint, payload, successMessage) => {
    setBusyAction(true);
    setActionNotice(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionNotice({ tone: 'error', text: body?.error || `Action failed (${res.status}).` });
        return false;
      }
      setActionNotice({ tone: 'ok', text: successMessage });
      await fetchUsage({ silent: true });
      return true;
    } catch (err) {
      setActionNotice({ tone: 'error', text: err?.message || 'Could not reach the server.' });
      return false;
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmRowBlock = async (e) => {
    e.preventDefault();
    if (!blockTarget) return;
    const ok = await postAdminAction(
      '/api/admin/free-usage/block',
      { visitor: blockTarget, durationHours: blockDuration, reason: blockReason },
      `Blocked ${blockTarget}.`,
    );
    if (ok) {
      setBlockTarget(null);
      setBlockReason('');
    }
  };

  const handleManualBlock = async (e) => {
    e.preventDefault();
    const visitor = manualVisitor.trim();
    if (!visitor) return;
    const ok = await postAdminAction(
      '/api/admin/free-usage/block',
      { visitor, durationHours: manualDuration, reason: manualReason },
      `Blocked ${visitor}.`,
    );
    if (ok) {
      setManualVisitor('');
      setManualReason('');
    }
  };

  const handleUnblock = async (visitor) => {
    await postAdminAction(
      '/api/admin/free-usage/unblock',
      { visitor },
      `Unblocked ${visitor}.`,
    );
  };

  const handleTogglePause = async (nextPaused) => {
    const ok = await postAdminAction(
      '/api/admin/free-usage/pause',
      { paused: nextPaused, reason: nextPaused ? pauseReason : '' },
      nextPaused ? 'Free AI is now paused site-wide.' : 'Free AI has been resumed.',
    );
    if (ok) {
      setPauseModalOpen(false);
      setPauseReason('');
    }
  };

  const handleToggleAutoBlock = async (enable) => {
    const hours = enable ? autoBlockHoursInput : data?.policy?.autoBlockHours || 24;
    await postAdminAction(
      '/api/admin/free-usage/mode',
      { autoBlockAbuse: enable, autoBlockHours: hours },
      enable
        ? `Automated abuse blocking activated (${hours}h blocks).`
        : 'Automated abuse blocking turned OFF (manual control only).',
    );
  };

  const handleTokenSubmit = (e) => {
    e.preventDefault();
    const cleaned = tokenInput.trim();
    if (!cleaned) return;
    writeSessionToken(cleaned);
    setAdminToken(cleaned);
    setTokenInput('');
    setError(null);
  };

  const handleSignOut = async () => {
    writeSessionToken('');
    setAdminToken('');
    setData(null);
    setError(null);
    setActionNotice(null);
    if (signInState?.signedIn) {
      await signOut().catch(() => {});
    }
  };

  const copyUserId = async () => {
    if (!signInState?.userId) return;
    try {
      await navigator.clipboard.writeText(signInState.userId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  const visibleVisitors = useMemo(() => {
    const list = data?.visitors || [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) => v.visitor.toLowerCase().includes(q));
  }, [data?.visitors, search]);

  const needsSignIn = !hasAuth || error?.status === 401 || error?.status === 403 || error?.status === 503;
  const isPaused = Boolean(data?.pause?.paused);
  const isAutoBlockOn = Boolean(data?.policy?.autoBlockAbuse);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              AppBlips
            </a>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-brand" />
              <h1 className="text-base font-semibold tracking-tight sm:text-lg">
                Free AI Usage &amp; Abuse Dashboard
              </h1>
            </div>
          </div>

          {hasAuth && !needsSignIn && (
            <div className="flex flex-wrap items-center gap-2">
              {isPaused ? (
                <button
                  type="button"
                  onClick={() => handleTogglePause(false)}
                  disabled={busyAction}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                  Resume Free AI
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPauseModalOpen((v) => !v)}
                  disabled={busyAction}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-500/20 dark:text-red-300 disabled:opacity-60"
                >
                  <PauseCircle className="h-3.5 w-3.5" />
                  Pause Free AI
                </button>
              )}
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="accent-brand"
                />
                Auto (30s)
              </label>
              <button
                type="button"
                onClick={() => fetchUsage()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg transition hover:bg-brand-hover disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {needsSignIn ? (
          <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
                {error?.status === 403 ? <ShieldAlert className="h-5 w-5 text-red-500" /> : <ShieldCheck className="h-5 w-5" />}
              </div>
              <div>
                <h2 className="text-base font-semibold">Admin Sign-In</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Restricted to authorized AppBlips administrators.
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
                <p className="font-medium">{error.message}</p>
                {error.status === 403 && signInState?.userId && (
                  <div className="mt-2 border-t border-red-500/20 pt-2 text-slate-700 dark:text-slate-300">
                    <p className="mb-1">
                      To grant access to your account, add your Clerk user ID to{' '}
                      <code className="font-mono text-[11px]">APPBLIPS_ADMIN_USER_IDS</code> in Cloudflare:
                    </p>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 truncate rounded bg-white/80 px-2 py-1 font-mono text-[11px] dark:bg-slate-950/60">
                        {signInState.userId}
                      </code>
                      <button
                        type="button"
                        onClick={copyUserId}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                      >
                        {copiedId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                        {copiedId ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              {signInState?.required !== false && !signInState?.signedIn && (
                <button
                  type="button"
                  onClick={() => signIn().catch(() => {})}
                  disabled={authBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg transition hover:bg-brand-hover disabled:opacity-60"
                >
                  <LogIn className="h-4 w-4" />
                  Sign in with Google or GitHub
                </button>
              )}

              {signInState?.signedIn && (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/50">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{signInState.displayName || signInState.email}</div>
                    <div className="truncate text-slate-500 dark:text-slate-400">{signInState.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="ml-2 shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-white dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Sign out
                  </button>
                </div>
              )}

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowTokenForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  {showTokenForm ? 'Hide admin token sign-in' : 'Use admin token instead'}
                </button>
              </div>

              {(showTokenForm || signInState?.required === false) && (
                <form onSubmit={handleTokenSubmit} className="space-y-2.5 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Admin Token (<code className="font-mono text-[11px]">APPBLIPS_ADMIN_TOKEN</code>)
                  </label>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Paste your admin token"
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-950"
                  />
                  <button
                    type="submit"
                    disabled={!tokenInput.trim()}
                    className="w-full rounded-xl border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    Unlock Dashboard
                  </button>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Stored only in this browser tab&apos;s sessionStorage and cleared when you close the tab.
                  </p>
                </form>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Emergency pause active banner */}
            {isPaused && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-800 dark:text-red-200">
                <div className="flex items-center gap-2.5">
                  <ShieldOff className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                  <div>
                    <p className="font-semibold">Emergency Kill Switch Active — Free AI is paused site-wide</p>
                    <p className="text-red-700/80 dark:text-red-300/80">
                      Users with their own API keys are unaffected.
                      {data?.pause?.reason ? ` Reason: ${data.pause.reason}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleTogglePause(false)}
                  disabled={busyAction}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  Resume Free AI
                </button>
              </div>
            )}

            {/* Confirm pause inline panel */}
            {pauseModalOpen && !isPaused && (
              <div className="rounded-2xl border border-red-500/30 bg-white p-4 shadow-sm dark:border-red-500/30 dark:bg-slate-900">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                  Pause Free AI for all visitors?
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Immediately blocks all Free AI requests until you click Resume. Users with their own API keys can still build normally.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={pauseReason}
                    onChange={(e) => setPauseReason(e.target.value)}
                    placeholder="Optional reason shown to users (e.g. Investigating traffic spike)"
                    className="min-w-60 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-red-500 dark:border-slate-700 dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    onClick={() => handleTogglePause(true)}
                    disabled={busyAction}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    Confirm Pause
                  </button>
                  <button
                    type="button"
                    onClick={() => setPauseModalOpen(false)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Meta status bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
                  <span className={`h-2 w-2 rounded-full ${isPaused ? 'bg-red-500' : 'bg-emerald-500'}`} />
                  UTC Day: <span className="font-mono">{data?.day || '—'}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Resets in <span className="font-mono font-medium">{formatResetCountdown(data?.resetsAt)}</span>
                </span>
                {data && !data.enabled && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                    Free limits currently OFF
                  </span>
                )}
              </div>
              <div>
                {lastFetchedAt ? `Updated ${lastFetchedAt.toLocaleTimeString()}` : 'Loading…'}
              </div>
            </div>

            {actionNotice && (
              <div
                className={`rounded-xl border px-4 py-2.5 text-xs font-medium ${
                  actionNotice.tone === 'error'
                    ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {actionNotice.text}
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
                {error.message}
              </div>
            )}

            {/* Abuse Blocking Mode control bar */}
            <section
              className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs shadow-sm ${
                isAutoBlockOn
                  ? 'border-indigo-500/40 bg-indigo-500/10 text-slate-800 dark:text-slate-100'
                  : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    Abuse Blocking Mode:{' '}
                    <span className={isAutoBlockOn ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-900 dark:text-white'}>
                      {isAutoBlockOn ? `Automated (${data?.policy?.autoBlockHours || 24}h auto-blocks)` : 'Manual Only (Monitor Mode)'}
                    </span>
                  </span>
                </div>
                <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                  {isAutoBlockOn
                    ? 'Users who repeatedly hammer rate limits or token caps (5+ refusals) are automatically blocked. Standard rate limits & token caps also remain active.'
                    : 'This admin system only flags suspicious users and will NOT automatically block anyone. Only your manual Block clicks (and your standard rate limits / token caps) apply.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!isAutoBlockOn ? (
                  <>
                    <select
                      value={autoBlockHoursInput}
                      onChange={(e) => setAutoBlockHoursInput(Number(e.target.value))}
                      aria-label="Auto-block duration"
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value={1}>Auto-block: 1h</option>
                      <option value={24}>Auto-block: 24h</option>
                      <option value={168}>Auto-block: 7d</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleToggleAutoBlock(true)}
                      disabled={busyAction}
                      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg transition hover:bg-brand-hover disabled:opacity-60"
                    >
                      Activate Automated Mode
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleToggleAutoBlock(false)}
                    disabled={busyAction}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 disabled:opacity-60"
                  >
                    Switch to Manual Only
                  </button>
                )}
              </div>
            </section>

            {/* Site-wide daily allowance card */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Site-Wide Daily Free AI Usage
                  </p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-bold sm:text-3xl">
                      {formatCompact(data?.site?.tokens ?? 0)}
                    </span>
                    <span className="font-mono text-sm text-slate-500 dark:text-slate-400">
                      / {data?.site?.limit ? formatCompact(data.site.limit) : 'No cap'} tokens
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  {data?.site?.pct != null ? (
                    <>
                      <span className="font-mono text-2xl font-bold">{data.site.pct}%</span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatNumber(data.site.remaining)} remaining today
                      </p>
                    </>
                  ) : (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Set <code className="font-mono">APPBLIPS_FREE_TOKENS_PER_DAY</code> for a site cap
                    </span>
                  )}
                </div>
              </div>
              {data?.site?.limit > 0 && (
                <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${barTone(data.site.pct, data.site.hitLimit)}`}
                    style={{ width: `${Math.min(100, data.site.pct ?? 0)}%` }}
                  />
                </div>
              )}
            </section>

            {/* KPI Summary Cards */}
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Active Today</span>
                  <Users className="h-4 w-4 text-slate-400" />
                </div>
                <div className="mt-2 font-mono text-2xl font-bold">
                  {formatNumber(data?.summary?.activeVisitors ?? 0)}
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Cap: {data?.limits?.tokensPerIpPerDay ? formatCompact(data.limits.tokensPerIpPerDay) : 'None'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Near Limit</span>
                  <AlertTriangle className={`h-4 w-4 ${(data?.summary?.nearLimit80 ?? 0) > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
                </div>
                <div className={`mt-2 font-mono text-2xl font-bold ${(data?.summary?.nearLimit80 ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                  {formatNumber(data?.summary?.nearLimit80 ?? 0)}
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  80–99% of cap
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>At Limit</span>
                  <Activity className={`h-4 w-4 ${(data?.summary?.atLimit ?? 0) > 0 ? 'text-orange-500' : 'text-slate-400'}`} />
                </div>
                <div className={`mt-2 font-mono text-2xl font-bold ${(data?.summary?.atLimit ?? 0) > 0 ? 'text-orange-600 dark:text-orange-400' : ''}`}>
                  {formatNumber(data?.summary?.atLimit ?? 0)}
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  100% token cap
                </p>
              </div>

              <button
                type="button"
                onClick={() => setFilterMode(filterMode === 'flagged' ? 'all' : 'flagged')}
                className={`rounded-2xl border p-4 text-left shadow-sm transition ${
                  filterMode === 'flagged'
                    ? 'border-red-500/60 bg-red-500/5'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Flagged Abuse</span>
                  <ShieldAlert className={`h-4 w-4 ${(data?.summary?.flaggedVisitors ?? 0) > 0 ? 'text-red-500' : 'text-slate-400'}`} />
                </div>
                <div className={`mt-2 font-mono text-2xl font-bold ${(data?.summary?.flaggedVisitors ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                  {formatNumber(data?.summary?.flaggedVisitors ?? 0)}
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Click to filter
                </p>
              </button>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Refusals Today</span>
                  <ShieldOff className={`h-4 w-4 ${(data?.summary?.refusalsToday ?? 0) > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
                </div>
                <div className="mt-2 font-mono text-2xl font-bold">
                  {formatNumber(data?.summary?.refusalsToday ?? 0)}
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  429s blocked
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Blocked</span>
                  <Ban className={`h-4 w-4 ${(data?.summary?.blockedVisitors ?? 0) > 0 ? 'text-red-500' : 'text-slate-400'}`} />
                </div>
                <div className={`mt-2 font-mono text-2xl font-bold ${(data?.summary?.blockedVisitors ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                  {formatNumber(data?.summary?.blockedVisitors ?? 0)}
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Active blocks
                </p>
              </div>
            </section>

            {/* Inline row block drawer */}
            {blockTarget && (
              <form
                onSubmit={handleConfirmRowBlock}
                className="rounded-2xl border border-red-500/30 bg-white p-4 shadow-sm dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                    Block <code className="font-mono">{blockTarget}</code> from Free AI
                  </p>
                  <button
                    type="button"
                    onClick={() => setBlockTarget(null)}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <select
                    value={blockDuration}
                    onChange={(e) => setBlockDuration(Number(e.target.value))}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-red-500 dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value={1}>1 hour</option>
                    <option value={24}>24 hours</option>
                    <option value={168}>7 days</option>
                    <option value={0}>Permanent (until unblocked)</option>
                  </select>
                  <input
                    type="text"
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    placeholder="Optional reason (e.g. Automated scraping)"
                    className="min-w-56 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-red-500 dark:border-slate-700 dark:bg-slate-950"
                  />
                  <button
                    type="submit"
                    disabled={busyAction}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    Block User
                  </button>
                </div>
              </form>
            )}

            {/* Filter & Users Table */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { label: 'All', value: 'all' },
                    { label: 'Flagged', value: 'flagged' },
                    { label: '50%+', value: '50' },
                    { label: '80%+', value: '80' },
                    { label: 'At limit', value: '100' },
                  ].map((pill) => (
                    <button
                      key={pill.value}
                      type="button"
                      onClick={() => setFilterMode(pill.value)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                        filterMode === pill.value
                          ? 'bg-brand text-brand-fg'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Filter user ID or IP…"
                      className="w-48 rounded-lg border border-slate-200 bg-slate-50 py-1 pr-2.5 pl-8 text-xs outline-none focus:border-brand focus:bg-white dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                  <select
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    aria-label="Max users shown"
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value={50}>Top 50</option>
                    <option value={100}>Top 100</option>
                    <option value={250}>Top 250</option>
                    <option value={500}>Top 500</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">User / Visitor</th>
                      <th className="px-4 py-2.5">Risk &amp; Signals</th>
                      <th className="px-4 py-2.5">Daily Token Usage</th>
                      <th className="px-4 py-2.5 text-right">Tokens</th>
                      <th className="px-4 py-2.5 text-right">Req / 1h</th>
                      <th className="px-4 py-2.5 text-right">429s</th>
                      <th className="px-4 py-2.5 text-right">Last Active</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {visibleVisitors.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                          {loading ? 'Loading live usage…' : 'No matching users found for today.'}
                        </td>
                      </tr>
                    ) : (
                      visibleVisitors.map((v) => {
                        const badge = riskBadge(v.riskLevel, v.pct, v.hitLimit);
                        const flags = (v.abuseFlags || []).filter((f) => f !== 'blocked');
                        return (
                          <tr key={v.visitor} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                            <td className="px-4 py-2.5 font-mono text-xs font-medium">
                              <div className="flex items-center gap-2">
                                <span className="max-w-52 truncate" title={v.visitor}>
                                  {v.visitor}
                                </span>
                                {v.inFlight > 0 && (
                                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                    {v.inFlight} live
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex flex-wrap items-center gap-1">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                                  {badge.label}
                                </span>
                                {flags.map((flag) => (
                                  <span
                                    key={flag}
                                    className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                  >
                                    {FLAG_LABELS[flag] || flag}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              {v.pct != null ? (
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                    <div
                                      className={`h-full rounded-full ${barTone(v.pct, v.hitLimit)}`}
                                      style={{ width: `${Math.min(100, v.pct)}%` }}
                                    />
                                  </div>
                                  <span className="w-11 font-mono text-[11px] font-semibold">
                                    {v.pct}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">No cap</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-medium">
                              {formatCompact(v.tokens)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-600 dark:text-slate-300">
                              {v.hourRequests}
                              {data?.limits?.requestsPerHour ? (
                                <span className="text-slate-400">/{data.limits.requestsPerHour}</span>
                              ) : null}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-mono ${(v.refusals || 0) >= 3 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                              {v.refusals || 0}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">
                              {formatRelativeTime(v.lastActiveAt)}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {v.blocked ? (
                                <button
                                  type="button"
                                  onClick={() => handleUnblock(v.visitor)}
                                  disabled={busyAction}
                                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300 disabled:opacity-50"
                                >
                                  Unblock
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => { setBlockTarget(v.visitor); setBlockDuration(24); setBlockReason(''); }}
                                  disabled={busyAction}
                                  className="rounded-lg border border-red-500/30 bg-red-500/5 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-500/15 dark:text-red-300 disabled:opacity-50"
                                >
                                  Block
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Bottom 2-column Security Panel: Active Blocks + Recent Abuse Events */}
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Active Blocks & Manual Block */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Ban className="h-4 w-4 text-red-500" />
                    Blocked Visitors ({data?.blocked?.length ?? 0})
                  </h2>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Block a Clerk user (<code className="font-mono">user_…</code> prefixed as <code className="font-mono">user:user_…</code>) or IP address from Free AI.
                </p>

                <form onSubmit={handleManualBlock} className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={manualVisitor}
                      onChange={(e) => setManualVisitor(e.target.value)}
                      placeholder="user:user_2abc… or 203.0.113.5"
                      className="min-w-44 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-950"
                    />
                    <select
                      value={manualDuration}
                      onChange={(e) => setManualDuration(Number(e.target.value))}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value={1}>1h</option>
                      <option value={24}>24h</option>
                      <option value={168}>7d</option>
                      <option value={0}>Permanent</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manualReason}
                      onChange={(e) => setManualReason(e.target.value)}
                      placeholder="Optional reason"
                      className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-950"
                    />
                    <button
                      type="submit"
                      disabled={busyAction || !manualVisitor.trim()}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Add Block
                    </button>
                  </div>
                </form>

                <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                  {(data?.blocked?.length ?? 0) === 0 ? (
                    <p className="py-5 text-center text-xs text-slate-400">
                      No active blocks right now.
                    </p>
                  ) : (
                    data.blocked.map((b) => (
                      <div key={b.visitor} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                        <div className="min-w-0">
                          <div className="truncate font-mono font-medium">{b.visitor}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Expires: {formatExpiry(b.expiresAt)}
                            {b.reason ? ` · ${b.reason}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUnblock(b.visitor)}
                          disabled={busyAction}
                          className="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                        >
                          Unblock
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recent Abuse & Rate-Limit Events */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  Recent Security &amp; Rate-Limit Events
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Latest 50 refusals, rate-limit hits, blocks, and kill-switch actions.
                </p>

                <div className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                  {(data?.recentEvents?.length ?? 0) === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-400">
                      No rate-limit or abuse events recorded yet.
                    </p>
                  ) : (
                    data.recentEvents.map((ev, idx) => {
                      const style = EVENT_STYLES[ev.type] || { label: ev.type, cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
                      return (
                        <div key={`${ev.at}-${ev.visitor}-${idx}`} className="flex items-start justify-between gap-2 py-2 text-xs">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${style.cls}`}>
                                {style.label}
                              </span>
                              <span className="truncate font-mono text-[11px] font-medium">{ev.visitor}</span>
                            </div>
                            {ev.detail && (
                              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{ev.detail}</p>
                            )}
                          </div>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {formatRelativeTime(ev.at)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
