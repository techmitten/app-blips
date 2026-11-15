import { confirmExternal } from '../lib/externalLinks';

// Buttons that leave AppBlips tell the customer where they are going and why
// before anything opens. `ask({ url, site, why }, action)` shows the dialog
// (rendered once by <ExternalLinkGuard>); `action` runs on Continue and
// defaults to opening `url` in a new tab. `dialog` is kept so existing callers
// that render it keep working.
export function useExternalConfirm() {
  return { ask: confirmExternal, dialog: null };
}
