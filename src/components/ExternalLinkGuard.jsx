import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { PRIMARY_BUTTON } from './SettingControls';
import { confirmExternal, hostOf, isExternalUrl, openExternalNow, setExternalListener } from '../lib/externalLinks';

// Mounted once. Shows the "this leaves AppBlips" dialog for every request
// made through confirmExternal, and catches any other click on a link to
// another website so no external link opens without it.
export default function ExternalLinkGuard() {
  const [pending, setPending] = useState(null);

  useEffect(() => setExternalListener((info, action) => setPending({ info, action })), []);

  useEffect(() => {
    // Bubble phase on purpose: links that already ask with their own reason
    // (ConfirmedLink) have called preventDefault by the time it gets here.
    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link || link.hasAttribute('download')) return;
      const href = link.getAttribute('href');
      if (!isExternalUrl(href)) return;
      event.preventDefault();
      confirmExternal({ url: link.href });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  if (!pending) return null;
  const { info, action } = pending;
  const host = hostOf(info.url);
  const close = () => setPending(null);
  const confirm = () => {
    close();
    if (action) action();
    else openExternalNow(info.url);
  };

  return (
    <ConfirmModal
      title={`Open ${info.site || host || 'this website'}?`}
      subtitle="This leaves AppBlips"
      onClose={close}
      onConfirm={confirm}
      confirmLabel="Continue"
      icon={ExternalLink}
      confirmClass={PRIMARY_BUTTON}
      zIndex={1100}
    >
      <p className="text-sm text-slate-700">
        {host
          ? <>This opens <span className="font-semibold">{host}</span> in your web browser.</>
          : <>This opens a page on another website in your web browser.</>}
      </p>
      {info.why && (
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Why:</span> {info.why}
        </p>
      )}
    </ConfirmModal>
  );
}
