import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  HelpCircle,
  KeyRound,
  LogIn,
  LogOut,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useFreeSignIn } from '../hooks/useFreeSignIn';
import { freeSignInHeaders } from '../lib/freeSignIn';

const ADMIN_TOKEN_KEY = 'appblips-admin-usage-token';
const AUTO_REFRESH_MS = 30_000;

const CHAT_STARTERS = [
  'Is any API abuse happening right now?',
  'Explain today’s usage in plain English',
  'Who are the heaviest users and should I block anyone?',
  'Do I need to raise my daily token limits?',
];

const FLAG_LABELS = {
  blocked: 'Blocked by you',
  repeated_rate_limit: 'Hit speed limit many times',
  rate_limit_hits: 'Hit speed limit',
  high_request_rate: 'Very high request rate',
  elevated_request_rate: 'Busy this hour',
  post_cap_hammering: 'Kept retrying after hitting cap',
};

const EVENT_INFO = {
  blocked: { label: 'Blocked attempt', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  auto_block: { label: 'Auto-blocked', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  admin_block: { label: 'You blocked user', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  admin_unblock: { label: 'You unblocked user', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  admin_pause: { label: 'Free AI paused', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  admin_resume: { label: 'Free AI resumed', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  admin_auto_on: { label: 'Auto-block turned ON', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  admin_auto_off: { label: 'Switched to Manual Mode', cls: 'bg-slate-700/70 text-slate-300 border-slate-600' },
  hourly_rate_limit: { label: 'Hourly speed limit', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  minute_rate_limit: { label: 'Too many prompts/min', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  message_gap: { label: 'Sent too fast', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  concurrency_limit: { label: 'Too many at once', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  user_token_cap: { label: 'Hit personal daily cap', cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  site_token_cap: { label: 'Hit site-wide daily cap', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
};

const formatNumber = (n) => (Number.isFinite(n) ? n.toLocaleString() : '—');

const formatCompact = (n) => {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
};

const formatRelativeTime = (iso) => {
  if (!iso) return 'Just now';
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
  if (!iso) return 'Until you unblock them';
  const diffMs = Date.parse(iso) - Date.now();
  if (diffMs <= 0) return 'Expired';
  const totalMin = Math.ceil(diffMs / 60_000);
  if (totalMin < 60) return `Ends in ${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  if (hours < 48) return `Ends in ${hours}h`;
  return `Ends in ${Math.ceil(hours / 24)}d`;
};

const parseVisitorLabel = (visitor) => {
  if (visitor.startsWith('user:')) {
    return { kind: 'Account', label: visitor.slice(5) };
  }
  return { kind: 'IP', label: visitor };
};

const barTone = (pct, hitLimit) => {
  if (hitLimit || (pct != null && pct >= 100)) return 'bg-red-500';
  if (pct != null && pct >= 80) return 'bg-amber-400';
  if (pct != null && pct >= 50) return 'bg-sky-400';
  return 'bg-emerald-400';
};

const statusPill = (riskLevel, pct, hitLimit) => {
  if (riskLevel === 'blocked') {
    return { label: 'Blocked', cls: 'bg-red-500/15 text-red-300 border-red-500/35' };
  }
  if (riskLevel === 'high') {
    return { label: 'Suspicious', cls: 'bg-red-500/15 text-red-300 border-red-500/35' };
  }
  if (riskLevel === 'medium') {
    return { label: 'Watch', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/35' };
  }
  if (hitLimit || (pct != null && pct >= 100)) {
    return { label: 'Hit daily cap', cls: 'bg-orange-500/15 text-orange-300 border-orange-500/35' };
  }
  if (pct != null && pct >= 80) {
    return { label: 'Near cap', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/35' };
  }
  return { label: 'Normal', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
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

function buildHealthSummary(data) {
  if (!data) {
    return {
      tone: 'neutral',
      title: 'Loading today’s Free AI status…',
      body: 'Pulling live usage numbers from Cloudflare.',
    };
  }
  if (data.pause?.paused) {
    return {
      tone: 'danger',
      title: 'Free AI is paused for everyone right now',
      body: `No Free AI requests are being accepted until you click Resume. Visitors using their own API keys are unaffected.${data.pause.reason ? ` Note: ${data.pause.reason}` : ''}`,
    };
  }
  if (data.site?.hitLimit) {
    return {
      tone: 'danger',
      title: 'Today’s site-wide Free AI budget is 100% used',
      body: `Free AI is paused automatically until midnight UTC (in ${formatResetCountdown(data.resetsAt)}). Raise APPBLIPS_FREE_TOKENS_PER_DAY in Cloudflare if you want to add more budget today.`,
    };
  }
  if ((data.summary?.flaggedVisitors ?? 0) > 0) {
    const n = data.summary.flaggedVisitors;
    return {
      tone: 'warning',
      title: `${n} ${n === 1 ? 'user is' : 'users are'} showing unusual activity`,
      body: data.policy?.autoBlockAbuse
        ? 'Automated abuse blocking is ON, so repeat offenders will be blocked automatically. You can review them in the list below.'
        : 'You are in Manual Mode, so nobody has been auto-blocked. Click "Suspicious" below to inspect them and decide whether to block.',
    };
  }
  if (data.site?.pct != null && data.site.pct >= 80) {
    return {
      tone: 'warning',
      title: `Today’s site-wide budget is ${data.site.pct}% used`,
      body: `About ${formatCompact(data.site.remaining)} tokens remain before the midnight UTC reset (in ${formatResetCountdown(data.resetsAt)}). No abuse has been detected.`,
    };
  }
  const active = data.summary?.activeVisitors ?? 0;
  return {
    tone: 'healthy',
    title: 'Everything looks healthy right now',
    body: active === 0
      ? 'No one has used Free AI yet today, and no suspicious activity has been detected.'
      : `${active} ${active === 1 ? 'person has' : 'people have'} used Free AI today with no suspicious activity detected.`,
  };
}

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
  const [showGuide, setShowGuide] = useState(false);

  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'flagged' | '80' | '100' | 'blocked'
  const [limit, setLimit] = useState(100);
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [copiedKey, setCopiedKey] = useState('');
  const [showOwnerHint, setShowOwnerHint] = useState(false);

  // Prevention controls state
  const [busyAction, setBusyAction] = useState(false);
  const [blockTarget, setBlockTarget] = useState(null);
  const [blockDuration, setBlockDuration] = useState(24);
  const [blockReason, setBlockReason] = useState('');
  const [manualVisitor, setManualVisitor] = useState('');
  const [manualDuration, setManualDuration] = useState(24);
  const [manualReason, setManualReason] = useState('');
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [autoBlockHoursInput, setAutoBlockHoursInput] = useState(24);

  // Built-in AI assistant state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatEndRef = useRef(null);

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
        setError({ status: 401, message: 'Sign in to view your Free AI dashboard.' });
        setData(null);
        return;
      }
      const params = new URLSearchParams({ limit: String(limit) });
      if (filterMode === 'flagged') params.set('flagged', '1');
      else if (filterMode === '80' || filterMode === '100') params.set('minPct', filterMode);

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
      `Blocked ${blockTarget} from Free AI.`,
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
      `Blocked ${visitor} from Free AI.`,
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
      nextPaused ? 'Free AI is now paused for everyone.' : 'Free AI is back online.',
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
        ? `Automated abuse blocking is now ON (${hours}h auto-blocks).`
        : 'Switched back to Manual Mode — nobody will be auto-blocked.',
    );
  };

  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatOpen, chatMessages, chatBusy]);

  const sendChatMessage = async (textOverride) => {
    const prompt = String(textOverride ?? chatInput).trim();
    if (!prompt || chatBusy) return;
    const nextMessages = [...chatMessages, { role: 'user', content: prompt }];
    setChatMessages(nextMessages);
    setChatInput('');
    setChatError('');
    setChatBusy(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/free-usage/chat', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
        cache: 'no-store',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChatError(body?.error || `Assistant error (${res.status}).`);
        return;
      }
      setChatMessages([...nextMessages, { role: 'assistant', content: body.reply }]);
    } catch (err) {
      setChatError(err?.message || 'Could not reach the AI assistant.');
    } finally {
      setChatBusy(false);
    }
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

  const copyText = async (key, text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 1800);
    } catch { /* clipboard blocked */ }
  };

  const visibleVisitors = useMemo(() => {
    let list = data?.visitors || [];
    if (filterMode === 'blocked') {
      list = list.filter((v) => Boolean(v.blocked));
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) => (
      v.visitor.toLowerCase().includes(q)
      || (v.email && v.email.toLowerCase().includes(q))
      || (v.name && v.name.toLowerCase().includes(q))
    ));
  }, [data?.visitors, filterMode, search]);

  const hasAccountVisitors = useMemo(
    () => (data?.visitors || []).some((v) => v.visitor.startsWith('user:')),
    [data?.visitors],
  );

  const needsSignIn = !hasAuth || error?.status === 401 || error?.status === 403 || error?.status === 503;
  const checkingAccess = hasAuth && !needsSignIn && !data && !error;
  const isAuthenticated = hasAuth && !needsSignIn && Boolean(data);
  const isPaused = Boolean(data?.pause?.paused);
  const isAutoBlockOn = Boolean(data?.policy?.autoBlockAbuse);
  const health = buildHealthSummary(data);

  const healthStyles = {
    healthy: {
      wrap: 'border-emerald-500/30 bg-emerald-500/10',
      icon: <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" />,
      title: 'text-emerald-200',
    },
    warning: {
      wrap: 'border-amber-500/35 bg-amber-500/10',
      icon: <AlertTriangle className="h-6 w-6 shrink-0 text-amber-400" />,
      title: 'text-amber-200',
    },
    danger: {
      wrap: 'border-red-500/40 bg-red-500/12',
      icon: <ShieldAlert className="h-6 w-6 shrink-0 text-red-400" />,
      title: 'text-red-200',
    },
    neutral: {
      wrap: 'border-slate-800 bg-slate-900/90',
      icon: <Sparkles className="h-6 w-6 shrink-0 text-sky-400" />,
      title: 'text-slate-100',
    },
  }[health.tone];

  const nearOrAtCount = (data?.summary?.atLimit ?? 0) + (data?.summary?.nearLimit80 ?? 0);

  if (!isAuthenticated) {
    return (
      <div className="palette-stock flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100 antialiased">
        {checkingAccess ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-6 py-4 text-sm text-slate-300 shadow-2xl shadow-black/50">
            <RefreshCw className="h-4 w-4 animate-spin text-sky-400" />
            Verifying access…
          </div>
        ) : (
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl shadow-black/50">
            <div className="mb-5 flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/30">
                {error?.status === 403 ? <ShieldAlert className="h-5 w-5 text-red-400" /> : <ShieldCheck className="h-5 w-5" />}
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">Sign In</h1>
                <p className="text-xs text-slate-400">
                  Authorized administrators only.
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-5 rounded-xl border border-red-500/35 bg-red-500/10 p-3.5 text-xs text-red-200">
                <p className="font-medium">
                  {error.status === 403
                    ? 'Access denied. This account is not authorized.'
                    : error.message}
                </p>
                {error.status === 403 && signInState?.userId && (
                  <div className="mt-2.5 border-t border-red-500/20 pt-2.5">
                    <button
                      type="button"
                      onClick={() => setShowOwnerHint((v) => !v)}
                      className="text-[11px] font-medium text-slate-300 underline decoration-slate-600 underline-offset-2 hover:text-white"
                    >
                      {showOwnerHint ? 'Hide owner setup info' : 'Site owner? Show your account ID'}
                    </button>
                    {showOwnerHint && (
                      <div className="mt-2.5 text-slate-300">
                        <p className="mb-2 leading-relaxed">
                          Add this ID to{' '}
                          <code className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-[11px] text-sky-300">
                            APPBLIPS_ADMIN_USER_IDS
                          </code>{' '}
                          in Cloudflare:
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 truncate rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-100">
                            {signInState.userId}
                          </code>
                          <button
                            type="button"
                            onClick={() => copyText('self', signInState.userId)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                          >
                            {copiedKey === 'self' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedKey === 'self' ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    )}
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
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60"
                >
                  <LogIn className="h-4 w-4" />
                  Sign in with Google or GitHub
                </button>
              )}

              {signInState?.signedIn && (
                <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-white">{signInState.displayName || signInState.email}</div>
                    <div className="truncate text-slate-400">{signInState.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="ml-2 shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
                  >
                    Sign out
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setShowTokenForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  {showTokenForm ? 'Hide token sign-in' : 'Use admin token'}
                </button>
                <a
                  href="/"
                  className="text-xs font-medium text-slate-500 hover:text-slate-300"
                >
                  Return home
                </a>
              </div>

              {(showTokenForm || signInState?.required === false) && (
                <form onSubmit={handleTokenSubmit} className="space-y-2.5 border-t border-slate-800 pt-3.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Admin Token
                  </label>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Enter admin token"
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                  />
                  <button
                    type="submit"
                    disabled={!tokenInput.trim()}
                    className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-white disabled:opacity-50"
                  >
                    Continue
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="palette-stock min-h-screen bg-slate-950 text-slate-100 antialiased">
      {/* Top navigation bar (rendered only after authentication succeeds) */}
      <header className="sticky top-0 z-20 border-b border-slate-800/90 bg-slate-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to AppBlips
            </a>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/30">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-sm font-semibold tracking-tight text-white sm:text-base">
                  Free AI Admin Dashboard
                </h1>
                <p className="hidden text-[11px] text-slate-400 sm:block">
                  Live token usage, daily limits, and abuse protection
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setChatOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                chatOpen
                  ? 'border-sky-400/60 bg-sky-500/20 text-sky-200'
                  : 'border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Ask AI
            </button>

            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                showGuide
                  ? 'border-sky-500/50 bg-sky-500/15 text-sky-200'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Guide
            </button>

            {isPaused ? (
              <button
                type="button"
                onClick={() => handleTogglePause(false)}
                disabled={busyAction}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                Resume Free AI
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPauseModalOpen((v) => !v)}
                disabled={busyAction}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-60"
              >
                <PauseCircle className="h-3.5 w-3.5" />
                Pause Free AI
              </button>
            )}

            <button
              type="button"
              onClick={() => fetchUsage()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="space-y-6">
            {/* Collapsible plain-English Quick Guide */}
            {showGuide && (
              <section className="rounded-2xl border border-sky-500/30 bg-sky-500/8 p-5 text-xs text-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-sky-200">How to read this dashboard</h2>
                    <p className="mt-0.5 text-slate-400">A quick cheat sheet — no technical jargon.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGuide(false)}
                    aria-label="Close guide"
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5">
                    <p className="font-semibold text-white">1. What are tokens?</p>
                    <p className="mt-1 leading-relaxed text-slate-400">
                      Tokens measure AI text sent and received. Because each edit resends the project context, a few normal builds can use millions of tokens (roughly ~30M tokens ≈ $1 on DeepSeek).
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5">
                    <p className="font-semibold text-white">2. What does &ldquo;Manual Mode&rdquo; mean?</p>
                    <p className="mt-1 leading-relaxed text-slate-400">
                      In Manual Mode, this page only flags suspicious users — it will never auto-block anyone. Your normal daily caps and speed limits still apply, and you decide who to block.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5">
                    <p className="font-semibold text-white">3. What makes a user &ldquo;Suspicious&rdquo;?</p>
                    <p className="mt-1 leading-relaxed text-slate-400">
                      Users who repeatedly hammer speed limits (5+ times), send a very high number of requests per hour, or keep retrying after hitting their daily cap.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5">
                    <p className="font-semibold text-white">4. When do counts reset?</p>
                    <p className="mt-1 leading-relaxed text-slate-400">
                      All daily token counts reset automatically at midnight UTC. Raising a cap in Cloudflare unblocks users right away without waiting for midnight.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Plain-English Health Verdict Banner */}
            <section className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 ${healthStyles.wrap}`}>
              <div className="flex items-start gap-3.5">
                {healthStyles.icon}
                <div>
                  <h2 className={`text-base font-semibold ${healthStyles.title}`}>
                    {health.title}
                  </h2>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-300">
                    {health.body}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1">
                  <Clock className="h-3.5 w-3.5 text-sky-400" />
                  Resets in <strong className="font-mono text-slate-200">{formatResetCountdown(data?.resetsAt)}</strong>
                </span>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-slate-300">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="accent-sky-500"
                  />
                  Live updates (30s)
                </label>
              </div>
            </section>

            {/* Confirm pause inline panel */}
            {pauseModalOpen && !isPaused && (
              <div className="rounded-2xl border border-red-500/40 bg-slate-900 p-5 shadow-lg">
                <p className="text-sm font-semibold text-red-300">
                  Pause Free AI for everyone?
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  This immediately stops all Free AI requests until you click Resume. Users with their own API key are not affected.
                </p>
                <div className="mt-3.5 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={pauseReason}
                    onChange={(e) => setPauseReason(e.target.value)}
                    placeholder="Optional note shown to users (e.g. Back in a few minutes)"
                    className="min-w-60 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleTogglePause(true)}
                    disabled={busyAction}
                    className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                  >
                    Yes, Pause Free AI
                  </button>
                  <button
                    type="button"
                    onClick={() => setPauseModalOpen(false)}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {actionNotice && (
              <div
                className={`rounded-xl border px-4 py-3 text-xs font-medium ${
                  actionNotice.tone === 'error'
                    ? 'border-red-500/35 bg-red-500/10 text-red-200'
                    : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                {actionNotice.text}
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                {error.message}
              </div>
            )}

            {/* Today's Overall Free AI Budget */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Today’s Total Free AI Usage (Everyone Combined)
                  </p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-2.5">
                    <span className="font-mono text-3xl font-bold text-white sm:text-4xl">
                      {formatCompact(data?.site?.tokens ?? 0)}
                    </span>
                    <span className="font-mono text-sm text-slate-400">
                      of {data?.site?.limit ? `${formatCompact(data.site.limit)} daily cap` : 'no daily cap set'}
                    </span>
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  {data?.site?.pct != null ? (
                    <>
                      <span className="font-mono text-3xl font-bold text-white">{data.site.pct}%</span>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatCompact(data.site.remaining)} tokens left today
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Set <code className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-sky-300">APPBLIPS_FREE_TOKENS_PER_DAY</code> in Cloudflare to add a cap
                    </p>
                  )}
                </div>
              </div>

              {data?.site?.limit > 0 && (
                <div className="mt-4 h-3.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barTone(data.site.pct, data.site.hitLimit)}`}
                    style={{ width: `${Math.min(100, data.site.pct ?? 0)}%` }}
                  />
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>
                  Per-person daily cap:{' '}
                  <strong className="font-mono text-slate-300">
                    {data?.limits?.tokensPerIpPerDay ? `${formatCompact(data.limits.tokensPerIpPerDay)} tokens` : 'Not set'}
                  </strong>
                </span>
                <span>
                  UTC Day: <strong className="font-mono text-slate-300">{data?.day || '—'}</strong>
                  {lastFetchedAt ? ` · Updated ${lastFetchedAt.toLocaleTimeString()}` : ''}
                </span>
              </div>
            </section>

            {/* 4 Easy-to-Scan Summary Cards */}
            <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`rounded-2xl border p-4 text-left transition ${
                  filterMode === 'all'
                    ? 'border-sky-500/50 bg-slate-900'
                    : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                  <span>People Active Today</span>
                  <Users className="h-4 w-4 text-sky-400" />
                </div>
                <div className="mt-2.5 font-mono text-3xl font-bold text-white">
                  {formatNumber(data?.summary?.activeVisitors ?? 0)}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Signed-in accounts or IPs today
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFilterMode(filterMode === '80' ? 'all' : '80')}
                className={`rounded-2xl border p-4 text-left transition ${
                  filterMode === '80' || filterMode === '100'
                    ? 'border-amber-500/50 bg-amber-500/8'
                    : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                  <span>Close to or At Cap</span>
                  <AlertTriangle className={`h-4 w-4 ${nearOrAtCount > 0 ? 'text-amber-400' : 'text-slate-500'}`} />
                </div>
                <div className={`mt-2.5 font-mono text-3xl font-bold ${nearOrAtCount > 0 ? 'text-amber-300' : 'text-white'}`}>
                  {formatNumber(nearOrAtCount)}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {data?.summary?.atLimit ?? 0} at 100% · {data?.summary?.nearLimit80 ?? 0} at 80–99%
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFilterMode(filterMode === 'flagged' ? 'all' : 'flagged')}
                className={`rounded-2xl border p-4 text-left transition ${
                  filterMode === 'flagged'
                    ? 'border-red-500/50 bg-red-500/10'
                    : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                  <span>Suspicious Activity</span>
                  <ShieldAlert className={`h-4 w-4 ${(data?.summary?.flaggedVisitors ?? 0) > 0 ? 'text-red-400' : 'text-slate-500'}`} />
                </div>
                <div className={`mt-2.5 font-mono text-3xl font-bold ${(data?.summary?.flaggedVisitors ?? 0) > 0 ? 'text-red-300' : 'text-white'}`}>
                  {formatNumber(data?.summary?.flaggedVisitors ?? 0)}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {formatNumber(data?.summary?.refusalsToday ?? 0)} blocked/limited requests today
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFilterMode(filterMode === 'blocked' ? 'all' : 'blocked')}
                className={`rounded-2xl border p-4 text-left transition ${
                  filterMode === 'blocked'
                    ? 'border-red-500/50 bg-red-500/10'
                    : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                  <span>Blocked Users</span>
                  <Ban className={`h-4 w-4 ${(data?.summary?.blockedVisitors ?? 0) > 0 ? 'text-red-400' : 'text-slate-500'}`} />
                </div>
                <div className={`mt-2.5 font-mono text-3xl font-bold ${(data?.summary?.blockedVisitors ?? 0) > 0 ? 'text-red-300' : 'text-white'}`}>
                  {formatNumber(data?.summary?.blockedVisitors ?? 0)}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {isAutoBlockOn ? 'Auto-blocking ON' : 'Manual blocking only'}
                </p>
              </button>
            </section>

            {/* Inline row block drawer */}
            {blockTarget && (
              <form
                onSubmit={handleConfirmRowBlock}
                className="rounded-2xl border border-red-500/40 bg-slate-900 p-5 shadow-lg"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-red-300">
                    Block <code className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-xs text-white">{blockTarget}</code> from Free AI
                  </p>
                  <button
                    type="button"
                    onClick={() => setBlockTarget(null)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  They won&apos;t be able to use your Free AI key until the timer ends or you unblock them.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={blockDuration}
                    onChange={(e) => setBlockDuration(Number(e.target.value))}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-red-500"
                  >
                    <option value={1}>Block for 1 hour</option>
                    <option value={24}>Block for 24 hours</option>
                    <option value={168}>Block for 7 days</option>
                    <option value={0}>Block until I unblock them</option>
                  </select>
                  <input
                    type="text"
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    placeholder="Optional note for yourself (e.g. Spamming prompts)"
                    className="min-w-56 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-red-500"
                  />
                  <button
                    type="submit"
                    disabled={busyAction}
                    className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                  >
                    Confirm Block
                  </button>
                </div>
              </form>
            )}

            {/* Users Table */}
            <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-white">People Using Free AI Today</h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Sorted from highest token usage at the top.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
                    {[
                      { label: 'Everyone', value: 'all' },
                      { label: 'Suspicious', value: 'flagged' },
                      { label: '80%+ Used', value: '80' },
                      { label: 'At Cap', value: '100' },
                      { label: 'Blocked', value: 'blocked' },
                    ].map((pill) => (
                      <button
                        key={pill.value}
                        type="button"
                        onClick={() => setFilterMode(pill.value)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                          filterMode === pill.value
                            ? 'bg-sky-600 text-white'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {pill.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search email, ID, or IP…"
                      className="w-52 rounded-xl border border-slate-800 bg-slate-950 py-1.5 pr-3 pl-8.5 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500"
                    />
                  </div>

                  <select
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    aria-label="Max users shown"
                    className="rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-sky-500"
                  >
                    <option value={50}>Top 50</option>
                    <option value={100}>Top 100</option>
                    <option value={250}>Top 250</option>
                    <option value={500}>Top 500</option>
                  </select>
                </div>
              </div>

              {data && data.emailLookupEnabled === false && hasAccountVisitors && (
                <div className="border-b border-slate-800 bg-slate-950/50 px-5 py-2.5 text-[11px] text-slate-400">
                  Tip: Add <code className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-sky-300">CLERK_SECRET_KEY</code> as a secret in Cloudflare → Settings → Variables and Secrets to display user email addresses alongside Clerk IDs.
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-5 py-3">User</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Daily Cap Used</th>
                      <th className="px-5 py-3">Recent Activity</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {visibleVisitors.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-400">
                          {loading ? 'Loading today’s usage…' : 'No users match this filter right now.'}
                        </td>
                      </tr>
                    ) : (
                      visibleVisitors.map((v) => {
                        const parsed = parseVisitorLabel(v.visitor);
                        const pill = statusPill(v.riskLevel, v.pct, v.hitLimit);
                        const flags = (v.abuseFlags || []).filter((f) => f !== 'blocked');
                        const perUserCap = data?.limits?.tokensPerIpPerDay || 0;
                        return (
                          <tr key={v.visitor} className="transition hover:bg-slate-800/35">
                            <td className="px-5 py-3.5">
                              <div className="space-y-1">
                                {v.email && (
                                  <div className="flex items-center gap-2">
                                    <span className="max-w-56 truncate text-xs font-semibold text-white" title={v.email}>
                                      {v.email}
                                    </span>
                                    {v.inFlight > 0 && (
                                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                                        Generating now
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  <span className="rounded-md border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                                    {parsed.kind}
                                  </span>
                                  <span
                                    className={`max-w-48 truncate font-mono ${v.email ? 'text-[11px] text-slate-400' : 'text-xs font-medium text-slate-100'}`}
                                    title={v.visitor}
                                  >
                                    {parsed.label}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => copyText(v.visitor, v.visitor)}
                                    title="Copy full ID"
                                    className="rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
                                  >
                                    {copiedKey === v.visitor
                                      ? <Check className="h-3 w-3 text-emerald-400" />
                                      : <Copy className="h-3 w-3" />}
                                  </button>
                                  {!v.email && v.inFlight > 0 && (
                                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                                      Generating now
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="px-5 py-3.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${pill.cls}`}>
                                  {pill.label}
                                </span>
                                {flags.map((flag) => (
                                  <span
                                    key={flag}
                                    className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300"
                                  >
                                    {FLAG_LABELS[flag] || flag}
                                  </span>
                                ))}
                              </div>
                            </td>

                            <td className="px-5 py-3.5">
                              {v.pct != null ? (
                                <div className="min-w-44">
                                  <div className="flex items-center gap-2.5">
                                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                                      <div
                                        className={`h-full rounded-full ${barTone(v.pct, v.hitLimit)}`}
                                        style={{ width: `${Math.min(100, v.pct)}%` }}
                                      />
                                    </div>
                                    <span className="w-12 text-right font-mono text-xs font-semibold text-white">
                                      {v.pct}%
                                    </span>
                                  </div>
                                  <p className="mt-1 font-mono text-[11px] text-slate-400">
                                    {formatCompact(v.tokens)} / {formatCompact(perUserCap)} tokens
                                  </p>
                                </div>
                              ) : (
                                <div>
                                  <span className="font-mono text-xs font-semibold text-white">
                                    {formatCompact(v.tokens)} tokens
                                  </span>
                                  <p className="text-[11px] text-slate-500">No per-user cap set</p>
                                </div>
                              )}
                            </td>

                            <td className="px-5 py-3.5">
                              <div className="text-xs text-slate-200">
                                {v.hourRequests} {v.hourRequests === 1 ? 'request' : 'requests'} this hour
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-400">
                                {formatRelativeTime(v.lastActiveAt)}
                                {(v.refusals || 0) > 0 && (
                                  <span className="ml-1.5 font-medium text-amber-300">
                                    · {v.refusals} {v.refusals === 1 ? 'limit hit' : 'limit hits'} today
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="px-5 py-3.5 text-right">
                              {v.blocked ? (
                                <button
                                  type="button"
                                  onClick={() => handleUnblock(v.visitor)}
                                  disabled={busyAction}
                                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                                >
                                  Unblock
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => { setBlockTarget(v.visitor); setBlockDuration(24); setBlockReason(''); }}
                                  disabled={busyAction}
                                  className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
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

            {/* Bottom 2-column Controls & Activity Feed */}
            <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {/* Safety Controls & Blocked Users */}
              <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
                {/* Automated vs Manual Mode */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldOff className={`h-4 w-4 ${isAutoBlockOn ? 'text-sky-400' : 'text-slate-400'}`} />
                      <h3 className="text-sm font-semibold text-white">
                        Abuse Blocking:{' '}
                        <span className={isAutoBlockOn ? 'text-sky-300' : 'text-emerald-300'}>
                          {isAutoBlockOn ? `Automated (${data?.policy?.autoBlockHours || 24}h)` : 'Manual Only'}
                        </span>
                      </h3>
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    {isAutoBlockOn
                      ? 'Users who hammer speed limits or retry after their daily cap 5+ times are blocked automatically.'
                      : 'Nobody is auto-blocked by this dashboard. You review flagged users and click Block only if you want to.'}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {!isAutoBlockOn ? (
                      <>
                        <select
                          value={autoBlockHoursInput}
                          onChange={(e) => setAutoBlockHoursInput(Number(e.target.value))}
                          aria-label="Auto-block duration"
                          className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500"
                        >
                          <option value={1}>Auto-block for 1h</option>
                          <option value={24}>Auto-block for 24h</option>
                          <option value={168}>Auto-block for 7d</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleToggleAutoBlock(true)}
                          disabled={busyAction}
                          className="rounded-xl bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60"
                        >
                          Turn On Automated Mode
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleAutoBlock(false)}
                        disabled={busyAction}
                        className="rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-60"
                      >
                        Switch Back to Manual Only
                      </button>
                    )}
                  </div>
                </div>

                {/* Manual Block Form + Active Blocks */}
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Ban className="h-4 w-4 text-red-400" />
                    Blocked Users ({data?.blocked?.length ?? 0})
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Manually block a specific Clerk account (<code className="font-mono text-slate-300">user:user_…</code>) or IP address.
                  </p>

                  <form onSubmit={handleManualBlock} className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={manualVisitor}
                        onChange={(e) => setManualVisitor(e.target.value)}
                        placeholder="user:user_2abc… or 203.0.113.5"
                        className="min-w-44 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500"
                      />
                      <select
                        value={manualDuration}
                        onChange={(e) => setManualDuration(Number(e.target.value))}
                        className="rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-sky-500"
                      >
                        <option value={1}>1 hour</option>
                        <option value={24}>24 hours</option>
                        <option value={168}>7 days</option>
                        <option value={0}>Permanent</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualReason}
                        onChange={(e) => setManualReason(e.target.value)}
                        placeholder="Optional note (e.g. Bot traffic)"
                        className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500"
                      />
                      <button
                        type="submit"
                        disabled={busyAction || !manualVisitor.trim()}
                        className="rounded-xl bg-red-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                      >
                        Block
                      </button>
                    </div>
                  </form>

                  <div className="mt-4 divide-y divide-slate-800/80 border-t border-slate-800">
                    {(data?.blocked?.length ?? 0) === 0 ? (
                      <p className="py-5 text-center text-xs text-slate-500">
                        Nobody is blocked right now.
                      </p>
                    ) : (
                      data.blocked.map((b) => (
                        <div key={b.visitor} className="flex items-center justify-between gap-3 py-3 text-xs">
                          <div className="min-w-0">
                            {b.email && (
                              <div className="truncate font-semibold text-white">{b.email}</div>
                            )}
                            <div className={`truncate font-mono ${b.email ? 'text-[11px] text-slate-400' : 'font-medium text-slate-100'}`}>
                              {b.visitor}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-400">
                              {formatExpiry(b.expiresAt)}
                              {b.reason ? ` · ${b.reason}` : ''}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleUnblock(b.visitor)}
                            disabled={busyAction}
                            className="shrink-0 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
                          >
                            Unblock
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Recent Alerts & Activity Log */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <ShieldAlert className="h-4 w-4 text-amber-400" />
                  Recent Alerts &amp; Limit Hits
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Live feed of the latest 50 limit hits, blocks, and setting changes.
                </p>

                <div className="mt-4 max-h-96 divide-y divide-slate-800/80 overflow-y-auto border-t border-slate-800 pr-1">
                  {(data?.recentEvents?.length ?? 0) === 0 ? (
                    <div className="py-12 text-center">
                      <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500/60" />
                      <p className="mt-2 text-xs text-slate-400">
                        No alerts or limit hits recorded yet.
                      </p>
                    </div>
                  ) : (
                    data.recentEvents.map((ev, idx) => {
                      const info = EVENT_INFO[ev.type] || {
                        label: ev.type,
                        cls: 'bg-slate-800 text-slate-300 border-slate-700',
                      };
                      const parsed = ev.visitor === 'site'
                        ? { kind: 'Site', label: 'Whole site' }
                        : parseVisitorLabel(ev.visitor);
                      return (
                        <div key={`${ev.at}-${ev.visitor}-${idx}`} className="flex items-start justify-between gap-3 py-3 text-xs">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${info.cls}`}>
                                {info.label}
                              </span>
                              <span className="truncate text-[11px] font-medium text-slate-200">
                                {ev.email ? `${ev.email} ` : ''}
                                <span className={`font-mono ${ev.email ? 'text-slate-400' : ''}`}>
                                  {ev.email ? `(${parsed.label})` : parsed.label}
                                </span>
                              </span>
                            </div>
                            {ev.detail && (
                              <p className="mt-1 text-[11px] text-slate-400">{ev.detail}</p>
                            )}
                          </div>
                          <span className="shrink-0 text-[11px] text-slate-500">
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
      </main>

      {/* Built-in AI Assistant (unmetered, uses the same Free AI model) */}
      <>
          {!chatOpen && (
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="fixed right-5 bottom-5 z-30 inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 text-xs font-semibold text-white shadow-xl shadow-sky-950/60 ring-1 ring-sky-400/40 transition hover:bg-sky-500"
            >
              <MessageSquare className="h-4 w-4" />
              Ask AI about this page
            </button>
          )}

          {chatOpen && (
            <aside
              aria-label="Admin AI Assistant"
              className="fixed right-4 bottom-4 z-40 flex h-140 max-h-[82vh] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-slate-700/90 bg-slate-900 shadow-2xl shadow-black/70"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/90 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/30">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-semibold text-white">Dashboard AI Assistant</h2>
                    <p className="text-[11px] text-emerald-400">
                      Unmetered · Does not count toward Free AI limits
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {chatMessages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setChatMessages([]); setChatError(''); }}
                      title="Clear conversation"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setChatOpen(false)}
                    aria-label="Close AI assistant"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-xs">
                {chatMessages.length === 0 ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-slate-300">
                      <p className="font-medium text-white">Ask me anything about today’s Free AI data.</p>
                      <p className="mt-1 leading-relaxed text-slate-400">
                        I can see your live usage totals, top users, risk flags, and recent events — and help you decide if any API abuse is happening.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-slate-400">Try asking:</p>
                      {CHAT_STARTERS.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => sendChatMessage(q)}
                          disabled={chatBusy}
                          className="block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-left text-xs text-slate-200 transition hover:border-sky-500/40 hover:bg-slate-800/80 disabled:opacity-50"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div
                      key={`${msg.role}-${idx}`}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-sky-600 text-white'
                            : 'border border-slate-800 bg-slate-950/80 text-slate-200'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}

                {chatBusy && (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 text-slate-400">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-sky-400" />
                      Analyzing live dashboard data…
                    </div>
                  </div>
                )}

                {chatError && (
                  <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-red-200">
                    {chatError}
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); sendChatMessage(); }}
                className="flex items-center gap-2 border-t border-slate-800 bg-slate-950/90 p-3"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about usage or possible abuse…"
                  disabled={chatBusy}
                  className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={chatBusy || !chatInput.trim()}
                  aria-label="Send message"
                  className="inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white transition hover:bg-sky-500 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </aside>
          )}
      </>
    </div>
  );
}
