import { useSyncExternalStore } from 'react';
import { getPlanWebSearch, subscribePlanWebSearch } from '../lib/planWeb';

// The plan web search allowance ({ uses, searches, fetches }) while the
// signed-in account's plan offers it, else null (lib/planWeb.js).
export function usePlanWebSearch() {
  return useSyncExternalStore(subscribePlanWebSearch, getPlanWebSearch, getPlanWebSearch);
}
