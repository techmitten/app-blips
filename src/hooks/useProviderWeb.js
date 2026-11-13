import { useEffect, useReducer, useSyncExternalStore } from 'react';
import { onProviderChange } from '../lib/desktop';
import { onConnectorsChange, providerSearchEnabled } from '../lib/connectors';
import { providerWebAvailability, refreshProviderWeb, subscribeProviderWeb } from '../lib/providerWeb';

// Whether web search is offered for the AI provider in use
// (lib/providerWeb.js), asked when the app starts and again whenever the
// provider changes (Settings → AI, onboarding, Reset).
// -> { available, paidBy, provider, fetch, searches, extensionOn }, where
// `extensionOn` is that provider's web search tool in Settings → Tools. The globe under the chat box shows when both are true.
export default function useProviderWeb() {
  useEffect(() => {
    const refresh = () => { refreshProviderWeb(); };
    refresh();
    return onProviderChange(refresh);
  }, []);
  const [, rerender] = useReducer((n) => n + 1, 0);
  useEffect(() => onConnectorsChange(rerender), []);
  const status = useSyncExternalStore(subscribeProviderWeb, providerWebAvailability, providerWebAvailability);
  return { ...status, extensionOn: providerSearchEnabled(status.provider) };
}

// The provider in use, without asking the server again (the app asks when it
// starts): for Settings → Tools, to say which web search is in use.
export function useProviderInUse() {
  return useSyncExternalStore(subscribeProviderWeb, providerWebAvailability, providerWebAvailability);
}
