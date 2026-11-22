import { useCallback, useEffect, useState } from 'react';

const MAX_LIST_HEIGHT = 320;
const EDGE_GAP = 12;
const LIST_GAP = 4;
const CLIP_OVERFLOWS = new Set(['auto', 'scroll', 'hidden', 'clip']);

// Intersect the visual viewport with any scrolling/clipping ancestors so we
// know when the anchor itself has scrolled out of view.
function getClipBounds(el, viewportTop, viewportLeft, viewportHeight, viewportWidth) {
  let top = viewportTop;
  let left = viewportLeft;
  let bottom = viewportTop + viewportHeight;
  let right = viewportLeft + viewportWidth;
  for (let node = el?.parentElement; node && node !== document.documentElement; node = node.parentElement) {
    const style = getComputedStyle(node);
    const clipsY = CLIP_OVERFLOWS.has(style.overflowY);
    const clipsX = CLIP_OVERFLOWS.has(style.overflowX);
    if (!clipsY && !clipsX) continue;
    const r = node.getBoundingClientRect();
    if (clipsY) {
      top = Math.max(top, r.top);
      bottom = Math.min(bottom, r.bottom);
    }
    if (clipsX) {
      left = Math.max(left, r.left);
      right = Math.min(right, r.right);
    }
  }
  return { top, left, bottom, right };
}

// Places a dropdown list portaled to <body> with fixed positioning under (or,
// when there's no room, above) its field, so a scrolling or overflow:hidden
// container can't clip it. Measured against the visual viewport so it stays
// put when a phone keyboard or pinch-zoom shrinks the visible area.
export default function useAnchoredList(anchorRef, listRef, open) {
  const [position, setPosition] = useState(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const rect = anchor?.getBoundingClientRect();
    if (!rect) return;
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportHeight = viewport?.height || window.innerHeight;
    const viewportWidth = viewport?.width || window.innerWidth;
    const clip = getClipBounds(anchor, viewportTop, viewportLeft, viewportHeight, viewportWidth);
    if (rect.bottom <= clip.top || rect.top >= clip.bottom || rect.right <= clip.left || rect.left >= clip.right) {
      setPosition(null);
      return;
    }
    const topEdge = viewportTop + EDGE_GAP;
    const bottomEdge = viewportTop + viewportHeight - EDGE_GAP;
    const belowTop = Math.min(bottomEdge, Math.max(topEdge, rect.bottom + LIST_GAP));
    const aboveBottom = Math.max(topEdge, Math.min(bottomEdge, rect.top - LIST_GAP));
    const below = Math.max(0, bottomEdge - belowTop);
    const above = Math.max(0, aboveBottom - topEdge);
    const openUp = below < MAX_LIST_HEIGHT && above > below && rect.top - LIST_GAP > clip.top;
    const width = Math.min(rect.width, Math.max(0, viewportWidth - EDGE_GAP * 2));
    setPosition({
      left: Math.max(viewportLeft + EDGE_GAP, Math.min(rect.left, viewportLeft + viewportWidth - EDGE_GAP - width)),
      width,
      maxHeight: Math.min(MAX_LIST_HEIGHT, openUp ? above : below),
      boxSizing: 'border-box',
      ...(openUp ? { bottom: window.innerHeight - aboveBottom } : { top: belowTop }),
    });
  }, [anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    const onScroll = (e) => { if (!listRef.current?.contains(e.target)) place(); };
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, place, listRef]);

  return [position, place];
}
