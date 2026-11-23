import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
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

// Below this preview-pane width the floating click-to-edit dock no longer
// fits on one row, so the editors switch to the phone layout instead.
export const FLOATING_DOCK_MIN_WIDTH = 1000;

// True when `pane` (an element) is narrower than FLOATING_DOCK_MIN_WIDTH.
export function usePaneTooNarrow(pane) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (!pane || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setNarrow(entry.contentRect.width < FLOATING_DOCK_MIN_WIDTH);
    });
    observer.observe(pane);
    return () => observer.disconnect();
  }, [pane]);
  return narrow;
}
