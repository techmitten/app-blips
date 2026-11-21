import { useEffect, useState } from 'react';
import { isDesktop, onProviderChange, webProviderStore } from '../lib/desktop';

// Whether the browser version is running on Free AI (no provider of the
// user's own in Settings → AI). Free AI takes no images, so the chat box hides
// its attach and screenshot buttons while this is true. Always false in the
// desktop app.
const freeInUse = () => !isDesktop && !webProviderStore.forRequest();

export default function useFreeAiInUse() {
  const [free, setFree] = useState(freeInUse);
  useEffect(() => onProviderChange(() => setFree(freeInUse())), []);
  return free;
}
