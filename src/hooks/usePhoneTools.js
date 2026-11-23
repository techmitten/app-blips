import { useCallback, useState, useSyncExternalStore } from 'react';
import { WIDE_LAYOUT_QUERY } from '../lib/config';

// Layout switch and pane lookup for components/PhoneTools.jsx.

const subscribeLayout = (onChange) => {
  const query = window.matchMedia(WIDE_LAYOUT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const isCompactLayout = () => !window.matchMedia(WIDE_LAYOUT_QUERY).matches;

// The same split App uses: not WIDE_LAYOUT_QUERY, so touch tablets too.
export const useCompactLayout = () => useSyncExternalStore(subscribeLayout, isCompactLayout, () => false);

// A callback ref for the bar's root that also finds the preview pane the
// bottom tools are portaled into (the bar's own dock would carry them off the
// top of the canvas).
export function usePreviewPaneRef(rootRef) {
  const [pane, setPane] = useState(null);
  const ref = useCallback((node) => {
    if (rootRef) rootRef.current = node;
    setPane(node?.closest('.preview-pane') || null);
  }, [rootRef]);
  return [ref, pane];
}
