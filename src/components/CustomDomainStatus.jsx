import { useState } from 'react';
import { Check, ChevronRight, CircleAlert, LifeBuoy, Loader2, RefreshCw } from 'lucide-react';
import { SURGE_CNAME_TARGET, dnsRecordsFor, surgeVerifyEmail } from '../lib/surge';
import { formatAgo, formatClock, formatWait, stepStates } from '../lib/domainStatus';
import { BetaBadge, CopyButton, LINK_CLASS, StatusDot } from './PublishControls';

// The Publish window's view of a custom domain on its way to going live
// (the done and manage steps of PublishDialog). Four steps, each saying
// what AppBlips found and what, if anything, is the user's move:
//   1. Uploaded       the files are on Surge, with a surge.sh link that
//                     works right away
//   2. DNS            the records, as the public sees them (Cloudflare's
//                     proxy, leftover records, cached old answers)
//   3. Surge          whether Surge has seen the domain (and the email
//                     verification it may be waiting for)
//   4. HTTPS          the certificate, and the rationed "ask Surge again"
// plus the records to add (open while the DNS step is the one waiting) and
// when the next check runs. `check` is useDomainStatus(host); `preview` is
// the surge.sh address of the upload; `onHelp` opens DnsHelpModal.
export default function CustomDomainStatus({ host, check, preview, onHelp }) {
  const { snapshot, progress } = check;
  const provider = snapshot?.provider || null;
  const records = dnsRecordsFor(host, { provider });

  if (progress.live) {
    return (
      <div className="space-y-2">
        <p role="status" className="flex items-start gap-2 text-xs leading-snug text-emerald-700 dark:text-emerald-400">
          <StatusDot ok className="mt-1" />
          <span><strong className="font-semibold">{host} is connected</strong> and its HTTPS certificate is ready.</span>
        </p>
        <RecordsDisclosure host={host}>
          <DnsRecords host={host} provider={provider} records={records} onHelp={onHelp} />
        </RecordsDisclosure>
      </div>
    );
  }

  const states = stepStates(snapshot);
  const dnsOpen = progress.stage === 'dns' || progress.stage === 'checking';
  return (
    <section aria-labelledby="domain-steps-title" className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 id="domain-steps-title" className="text-sm font-semibold text-slate-900">Connecting {host}<BetaBadge /></h3>
      <p role="status" className="sr-only">{progress.label}</p>
      <ol className="text-xs leading-snug">
        <Step state="done" title="Uploaded to Surge">
          {preview && (
            <p>
              See it now at{' '}
              <a href={preview} target="_blank" rel="noopener noreferrer" className={`${LINK_CLASS} break-all`}>{preview.replace(/^https:\/\//, '')}</a>
              {' '}while the domain connects.
            </p>
          )}
        </Step>
        <Step state={states.dns} title={`DNS points ${host} to Surge`}>
          <DnsDetail host={host} snapshot={snapshot} state={states.dns} />
        </Step>
        <Step state={states.surge} title="Surge sees the domain">
          <SurgeDetail host={host} snapshot={snapshot} state={states.surge} />
        </Step>
        <Step state={states.cert} title="HTTPS certificate" last>
          <CertDetail host={host} snapshot={snapshot} state={states.cert} check={check} />
        </Step>
      </ol>
      {dnsOpen
        ? <div className="border-t border-slate-200 pt-3"><DnsRecords host={host} provider={provider} records={records} onHelp={onHelp} /></div>
        : <RecordsDisclosure host={host}><DnsRecords host={host} provider={provider} records={records} onHelp={onHelp} /></RecordsDisclosure>}
      <CheckFooter check={check} />
    </section>
  );
}

const STATE_WORDS = { done: 'done', active: 'in progress', problem: 'needs your attention', todo: 'not started' };

function StepIcon({ state }) {
  const base = 'relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full';
  if (state === 'done') return <span className={`${base} bg-emerald-500 text-white`}><Check size={12} strokeWidth={3} aria-hidden="true" /></span>;
  if (state === 'problem') return <span className={`${base} bg-amber-500 text-white`}><CircleAlert size={13} strokeWidth={2.5} aria-hidden="true" /></span>;
  if (state === 'active') return <span className={`${base} border-2 border-indigo-500 bg-surface text-indigo-600`}><Loader2 size={11} strokeWidth={3} className="motion-safe:animate-spin" aria-hidden="true" /></span>;
  return <span className={`${base} border-2 border-slate-300 bg-surface`} />;
}

// One checklist row. Details show only once the step has started.
function Step({ state, title, last = false, children }) {
  return (
    <li className={`relative flex gap-3 ${last ? '' : 'pb-3'}`}>
      {!last && <span aria-hidden="true" className={`absolute left-[9.5px] top-5 bottom-0 w-px ${state === 'done' ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
      <StepIcon state={state} />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className={`font-semibold ${state === 'todo' ? 'text-slate-500' : 'text-slate-900'}`}>
          {title}<span className="sr-only">: {STATE_WORDS[state]}</span>
        </p>
        {state !== 'todo' && children && <div className="mt-0.5 space-y-1 break-words text-slate-600">{children}</div>}
      </div>
    </li>
  );
}

const Mono = ({ children }) => <span className="font-mono text-[12px] text-slate-800 break-all">{children}</span>;

// What a lookup found: "CNAME geo.surge.world" or "1.2.3.4, 5.6.7.8".
const found = (dns) => (dns?.cname?.length ? `CNAME ${dns.cname[0]}` : (dns?.ips || []).join(', '));

function DnsDetail({ host, snapshot, state }) {
  if (!snapshot) return <p>Looking up {host}…</p>;
  const { dns, www } = snapshot;
  const cached = dns.ttl ? formatWait(dns.ttl) : '';
  let main;
  if (state === 'done' && dns.status !== 'connected') {
    // Surge already sees it; the public lookup still has the old answer.
    main = <p>Surge can see the new record. Some networks may show the old one for up to {cached || 'a few hours'}.</p>;
  } else if (dns.status === 'connected') {
    main = <p>Found <Mono>{found(dns)}</Mono>{snapshot.provider === 'surge' ? ' (Surge’s name servers)' : ''}.</p>;
  } else if (dns.status === 'missing') {
    main = <p>No record for {host} yet. Add the records below; AppBlips notices as soon as they’re live.</p>;
  } else if (dns.status === 'elsewhere') {
    main = (
      <p>
        {host} still points to <Mono>{found(dns)}</Mono>, not Surge. Replace that record with the one below.
        {cached && ` After you change it, some networks keep the old answer for up to ${cached}.`}
      </p>
    );
  } else if (dns.status === 'proxied') {
    main = (
      <p className="text-slate-800">
        Cloudflare’s proxy is on (the orange cloud). In Cloudflare, open <strong className="font-semibold">DNS → Records</strong> and
        click the orange cloud beside each record for {host} so it turns grey (<strong className="font-semibold">DNS only</strong>).
        Through the proxy, Surge can’t see the domain or give it HTTPS.
      </p>
    );
  } else if (dns.status === 'mixed') {
    const ipv6 = (dns.extra || []).some((ip) => ip.includes(':'));
    main = (
      <p className="text-slate-800">
        {host} also points to <Mono>{(dns.extra || []).join(', ')}</Mono>. Delete that {ipv6 ? 'AAAA (IPv6)' : 'A'} record so only Surge’s is left
        {ipv6 ? ': Let’s Encrypt checks IPv6 first, so HTTPS can’t be issued while it’s there.' : ', or visitors are split between the two.'}
      </p>
    );
  } else {
    main = <p>Couldn’t look up {host} just now. AppBlips keeps trying.</p>;
  }
  return (
    <>
      {main}
      {www && <WwwLine host={host} www={www} />}
    </>
  );
}

// A root domain's www name: optional, but the records add it so both work.
function WwwLine({ host, www }) {
  const name = `www.${host}`;
  const text = {
    connected: 'points to Surge too',
    missing: 'no record yet. Add the www record below so it opens the site too',
    elsewhere: <>points to <Mono>{found(www)}</Mono>. Change it to the www record below</>,
    proxied: 'Cloudflare’s proxy is on. Set it to DNS only too',
    mixed: <>also points to <Mono>{(www.extra || []).join(', ')}</Mono>. Delete that record</>,
    unknown: 'couldn’t be looked up just now',
  }[www.status];
  return (
    <p className="flex items-start gap-1.5">
      <span className={`mt-1 inline-flex h-1.5 w-1.5 shrink-0 rounded-full ${www.status === 'connected' ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />
      <span><Mono>{name}</Mono>: {text}.</span>
    </p>
  );
}

function SurgeDetail({ host, snapshot, state }) {
  if (state === 'done') return <p>Surge has picked up {host}.</p>;
  if (snapshot?.surge?.status === 'ready') {
    return (
      <>
        <p className="text-slate-800">
          Surge is holding {host} until you verify your Surge account. Click the link in the email Surge sent you; it carries on by itself after that.
        </p>
        <VerifyEmail />
      </>
    );
  }
  if (snapshot?.signedOut) return <p>Sign in to Surge to follow this step.</p>;
  const cached = snapshot?.dns?.ttl ? formatWait(snapshot.dns.ttl) : '';
  return (
    <p>
      Surge hasn’t seen the new record yet. It checks by itself, usually within minutes
      {cached ? `, though an old cached answer can delay it by up to ${cached}` : ''}.
    </p>
  );
}

// Resends Surge's verification email.
function VerifyEmail() {
  // '' | 'sending' | { text, error }
  const [state, setState] = useState('');
  const send = async () => {
    setState('sending');
    const result = await surgeVerifyEmail();
    setState(result.error
      ? { text: result.error, error: true }
      : result.verified
        ? { text: 'Your email is already verified. Surge can take a minute to notice.' }
        : { text: result.message || 'Email sent. Check your inbox and spam folder.' });
  };
  if (state && state !== 'sending') return <p className={state.error ? 'text-red-600' : 'font-medium text-slate-800'}>{state.text}</p>;
  return (
    <p>
      <button type="button" onClick={send} disabled={state === 'sending'} className={`${LINK_CLASS} disabled:opacity-50`}>
        {state === 'sending' ? 'Sending…' : 'Resend the email'}
      </button>
    </p>
  );
}

function CertDetail({ host, snapshot, state, check }) {
  const { plan, request, requestCert, now } = check;
  if (state === 'done') {
    const { cert } = snapshot || {};
    return (
      <p>
        {cert?.issued ? `Issued${cert.issuer ? ` by ${cert.issuer}` : ''}${cert.expires ? `, valid for ${cert.expires}` : ''}. ` : ''}
        Surge renews it by itself.
      </p>
    );
  }
  let nudge = null;
  if (request.status === 'requesting') {
    nudge = <p className="inline-flex items-center gap-1.5"><Loader2 size={12} className="motion-safe:animate-spin" aria-hidden="true" />Asking Surge for the certificate…</p>;
  } else if (request.status === 'issued') {
    nudge = <p className="font-medium text-slate-800">Surge has the certificate. Finishing up…</p>;
  } else if (plan.lockedUntil) {
    nudge = (
      <p className="text-slate-800">
        Let’s Encrypt is pausing new tries for {host} until {formatClock(plan.lockedUntil)}, after too many attempts. Nothing to do: Surge keeps trying by itself.
      </p>
    );
  } else if (plan.show) {
    nudge = (
      <p>
        {request.status === 'error' && <span className="block text-slate-800">Surge said: {request.message}</span>}
        {plan.availableAt > now
          ? `Still waiting? You can ask Surge again at ${formatClock(plan.availableAt)}.`
          : (
            <>
              Taking longer than usual.{' '}
              <button type="button" onClick={requestCert} className={LINK_CLASS}>Ask Surge again</button>
            </>
          )}
      </p>
    );
  }
  return (
    <>
      <p>Surge is getting a free certificate from Let’s Encrypt. This usually takes a few minutes, with nothing for you to do.</p>
      {nudge}
    </>
  );
}

// The records, folded away once they're no longer the step being waited on.
function RecordsDisclosure({ host, children }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-xs font-semibold text-indigo-600 hover:underline [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1">
          <ChevronRight size={13} className="transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
          DNS records for {host}
        </span>
      </summary>
      <div className="pt-2.5">{children}</div>
    </details>
  );
}

// The records to add, worded for where the domain's DNS is.
function DnsRecords({ host, provider, records, onHelp }) {
  if (provider === 'surge') {
    return (
      <p className="text-xs leading-snug text-slate-600">
        {host} uses Surge’s name servers, so there are no records to add.
      </p>
    );
  }
  const cloudflare = provider === 'cloudflare';
  const root = records[0].root;
  const names = records.map((record) => record.name);
  return (
    <div className="space-y-2.5 text-xs leading-snug text-slate-600">
      <p>
        {cloudflare
          ? <>The DNS for <strong className="font-semibold text-slate-800">{host}</strong> is at Cloudflare. In the Cloudflare dashboard, open <strong className="font-semibold text-slate-800">DNS → Records</strong> and add {records.length > 1 ? 'these records' : 'this record'}:</>
          : <>Where you manage the DNS for <strong className="font-semibold text-slate-800">{host}</strong> (usually the company you bought it from), add {records.length > 1 ? 'these records' : 'this record'}:</>}
      </p>
      <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-surface text-left">
        <thead>
          <tr>
            {['Type', 'Name', 'Value', ...(cloudflare ? ['Proxy'] : [])].map((term) => (
              <th key={term} scope="col" className="border-b border-slate-200 px-3 py-1.5 font-medium text-slate-600">{term}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((item) => (
            <tr key={`${item.type} ${item.name}`} className="border-b border-slate-200 last:border-b-0">
              <td className="px-3 py-1.5 font-mono text-[13px] text-slate-900">{item.type}</td>
              <td className="px-3 py-1.5 font-mono text-[13px] text-slate-900">{item.name}</td>
              <td className="px-3 py-1.5 font-mono text-[13px] text-slate-900">
                <span className="flex min-w-0 items-center gap-1">
                  <span className="min-w-0 break-all">{item.value}</span>
                  <CopyButton value={item.value} label={`DNS value for ${item.name}`} compact />
                </span>
              </td>
              {cloudflare && <td className="whitespace-nowrap px-3 py-1.5 text-slate-900">{item.proxy}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="list-disc space-y-1 pl-4">
        {cloudflare && (
          <li>
            Set <strong className="font-semibold text-slate-800">Proxy status</strong> to <strong className="font-semibold text-slate-800">DNS only</strong> (grey cloud).
            With the orange cloud on, Surge can’t see the domain, so it can’t go live or get HTTPS.
          </li>
        )}
        {cloudflare && root && <li>Cloudflare accepts a CNAME on <Mono>@</Mono> and “flattens” it. That’s expected.</li>}
        {!cloudflare && root && (
          <li>
            If your provider offers ALIAS or ANAME records, point <Mono>@</Mono> at <Mono>{SURGE_CNAME_TARGET}</Mono> instead.
            Visitors then reach their nearest Surge server; the A record serves everyone from San Francisco.
          </li>
        )}
        <li>Delete any other A, AAAA or CNAME records for {names.map((name, i) => <span key={name}>{i > 0 && ' and '}<Mono>{name}</Mono></span>)}.</li>
        <li>Changes usually show up within minutes. Some providers take a few hours.</li>
      </ul>
      <p>
        <button type="button" onClick={onHelp} className={`inline-flex items-start gap-1 text-left ${LINK_CLASS}`}>
          <LifeBuoy size={13} className="mt-px shrink-0" aria-hidden="true" />Not sure how? Guides for GoDaddy, Namecheap, Cloudflare and others
        </button>
      </p>
    </div>
  );
}

// When the last check ran and the next one will, with a way to check now.
function CheckFooter({ check }) {
  const { checking, checkedAt, nextAt, paused, now, failed, checkNow } = check;
  const text = checking
    ? 'Checking…'
    : paused
      ? 'Checks are paused while AppBlips is in the background.'
      : checkedAt
        ? `Checked ${formatAgo(now - checkedAt)}${nextAt ? ` · next check in ${Math.max(1, Math.ceil((nextAt - now) / 1000))} s` : ''}`
        : '';
  return (
    <div className="flex items-start justify-between gap-3 border-t border-slate-200 pt-3 text-xs leading-snug text-slate-600">
      <p className="min-w-0">
        {text}
        {failed && <span className="block text-red-600">{failed}</span>}
      </p>
      <button type="button" onClick={checkNow} disabled={checking} className={`inline-flex shrink-0 items-center gap-1 ${LINK_CLASS} disabled:opacity-50`}>
        <RefreshCw size={12} className={checking ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />Check now
      </button>
    </div>
  );
}
