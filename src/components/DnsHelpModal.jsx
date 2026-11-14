import { useEffect } from 'react';
import { ExternalLink, LifeBuoy } from 'lucide-react';
import Modal, { ModalCloseButton } from './Modal';
import { PRIMARY_BUTTON } from './SettingControls';
import { DNS_PROVIDERS, providerGuideUrl } from '../lib/dnsProviders';

// Opened from Publish's custom domain checklist (CustomDomainStatus): links to each popular domain
// provider's own guide for adding a DNS record, so people can follow
// instructions for the screens they actually see. The records to add are
// repeated at the top because this window covers the one that shows them.
// Escape closes only this window.
export default function DnsHelpModal({ host, records, onClose, zIndex = 80 }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <Modal
      zIndex={zIndex}
      cardClass="w-full max-w-md xl:max-w-lg bg-surface rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-scale-in flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]"
      cardProps={{ role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'dns-help-title', 'aria-describedby': 'dns-help-intro' }}
    >
      <div className="shrink-0 px-6 py-5 border-b border-slate-100 flex items-center justify-between">
        <h2 id="dns-help-title" className="flex items-center gap-2 text-base 2xl:text-lg font-semibold text-slate-900">
          <LifeBuoy size={18} aria-hidden="true" />
          DNS help for your provider
        </h2>
        <ModalCloseButton onClick={onClose} />
      </div>

      <div className="min-h-0 overflow-y-auto p-6 space-y-5 text-sm text-slate-700">
        <div className="space-y-2.5">
          <p id="dns-help-intro" className="text-xs leading-snug text-slate-600">
            Pick the company you bought <strong className="font-semibold text-slate-800">{host}</strong> from. Its guide opens in your browser.
            Follow it to add {records.length > 1 ? 'these records' : 'this record'}:
          </p>
          {records.map((record) => (
            <p key={`${record.type} ${record.name}`} className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span>Type <span className="font-mono text-[13px] text-slate-900">{record.type}</span></span>
              <span>Name <span className="font-mono text-[13px] text-slate-900">{record.name}</span></span>
              <span className="min-w-0 break-all">Value <span className="font-mono text-[13px] text-slate-900">{record.value}</span></span>
              {record.proxy && <span>Proxy <span className="font-semibold text-slate-900">{record.proxy}</span></span>}
            </p>
          ))}
        </div>

        <ul className="grid gap-2 sm:grid-cols-2">
          {DNS_PROVIDERS.map((provider) => (
            <li key={provider.name}>
              <a
                href={providerGuideUrl(provider, records[0].type)}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2.5 transition-colors hover:border-indigo-300 hover:bg-indigo-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-900">{provider.name}</span>
                  {provider.note && <span className="block text-xs text-slate-600">{provider.note}</span>}
                </span>
                <ExternalLink size={14} className="shrink-0 text-slate-400 transition-colors group-hover:text-indigo-600" aria-label="(opens in a new tab)" />
              </a>
            </li>
          ))}
        </ul>

        <p className="text-xs leading-snug text-slate-600">
          Not listed? Search your provider&rsquo;s help pages for &ldquo;add DNS record&rdquo;. If your domain uses another company&rsquo;s
          nameservers, such as Cloudflare&rsquo;s, add the records there instead. On Cloudflare, set each record&rsquo;s proxy status
          to <strong className="font-semibold text-slate-800">DNS only</strong> (grey cloud): Surge can&rsquo;t see the domain through the proxy.
        </p>
      </div>

      <div className="shrink-0 bg-slate-50 px-6 py-4 flex justify-end">
        <button type="button" onClick={onClose} autoFocus className={PRIMARY_BUTTON}>Done</button>
      </div>
    </Modal>
  );
}
