import { useLayoutEffect, useState } from 'react';

// Positioning engine for the guided tour: finds the step's anchor, keeps a
// spotlight rect on it, and docks the card where it stays put (a corner on
// desktop and tablet, a sheet on phones) without covering the anchor. Stays attached across pane switches, resizing,
// scrolling, the on-screen keyboard (visualViewport), and late-mounting
// anchors (e.g. Export appearing once a build lands).

const MARGIN = 12;   // card <-> viewport edge
const PAD = 6;       // spotlight <-> anchor
export const SHEET_QUERY = '(max-width: 639px)';

// Anchors like `apps`/`settings`/`help` exist twice (desktop nav + the hidden
// mobile drawer); the visible one is the one that counts. `names` is a
// fallback list: the first name with a visible element wins.
export function findTarget(names) {
  for (const name of [].concat(names)) {
    const element = [...document.querySelectorAll(`[data-tour="${name}"]`)]
      .find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (element) return element;
  }
  return null;
}

function sameGeometry(a, b) {
  if (!a || !b) return a === b;
  const keys = ['left', 'top', 'width', 'maxHeight', 'placement', 'corner', 'arrow', 'sheet'];
  if (keys.some(k => a[k] !== b[k])) return false;
  const ta = a.target; const tb = b.target;
  if (!ta || !tb) return ta === tb;
  return ta.left === tb.left && ta.top === tb.top && ta.width === tb.width && ta.height === tb.height;
}

function viewportBox() {
  const vv = window.visualViewport;
  return {
    x: vv?.offsetLeft || 0,
    y: vv?.offsetTop || 0,
    width: vv?.width || window.innerWidth,
    height: vv?.height || window.innerHeight,
  };
}

// The card's own height, not counting its arrow. The arrow pokes out of the
// card (which then has overflow: visible), so on a card placed above its
// anchor it adds to scrollHeight but beside the anchor it doesn't. Counting
// it made a card that only just fitted above flip to the side, measure
// shorter, flip back above, and so on forever.
function cardContentHeight(card) {
  const arrow = card.querySelector('.tour-arrow');
  const previous = arrow?.style.display;
  if (arrow) arrow.style.display = 'none';
  const height = Math.max(card.scrollHeight, card.offsetHeight);
  if (arrow) arrow.style.display = previous || '';
  return height || 260;
}

function computeGeometry(element, card) {
  const vp = viewportBox();
  const sheet = window.matchMedia(SHEET_QUERY).matches;
  const cardWidth = sheet ? vp.width : Math.min(380, vp.width - MARGIN * 2);
  const cardHeight = card ? cardContentHeight(card) : 260;
  const rect = element?.getBoundingClientRect();
  const visible = rect && rect.width > 0 && rect.height > 0
    && rect.bottom > vp.y && rect.top < vp.y + vp.height;

  let target = null;
  if (visible) {
    const left = Math.max(vp.x + PAD, rect.left - PAD);
    const top = Math.max(vp.y + PAD, rect.top - PAD);
    const right = Math.min(vp.x + vp.width - PAD, rect.right + PAD);
    const bottom = Math.min(vp.y + vp.height - PAD, rect.bottom + PAD);
    target = { left: Math.round(left), top: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) };
  }

  // Phones: the card docks as a full-width sheet, so only the spotlight moves.
  // It sits at the bottom unless that would cover the anchor (the prompt dock
  // and mode key live at the bottom of a phone screen) and docking on top
  // leaves it fully clear. A screen-filling anchor (the preview) keeps the
  // bottom sheet, so its toolbar and the Chat/Preview switch stay visible.
  if (sheet) {
    const maxHeight = Math.round(vp.height * 0.6);
    const sheetHeight = Math.min(cardHeight, maxHeight);
    const coversBottom = target && target.top + target.height > vp.y + vp.height - sheetHeight;
    const clearOnTop = target && target.top >= vp.y + sheetHeight;
    const placement = coversBottom && clearOnTop ? 'sheet-top' : 'sheet';
    return { target, sheet: true, placement, arrow: null, left: 0, top: 0, width: cardWidth, maxHeight };
  }

  // Desktop and tablet: the card docks in a corner and stays there; only the
  // spotlight moves between steps. Bottom-right unless that would cover the
  // anchor, then the next corner that leaves it clear.
  const maxHeight = Math.round(vp.height - MARGIN * 2);
  const height = Math.min(cardHeight, maxHeight);
  const corners = [
    { name: 'bottom-right', left: vp.x + vp.width - MARGIN - cardWidth, top: vp.y + vp.height - MARGIN - height },
    { name: 'top-right', left: vp.x + vp.width - MARGIN - cardWidth, top: vp.y + MARGIN },
    { name: 'bottom-left', left: vp.x + MARGIN, top: vp.y + vp.height - MARGIN - height },
    { name: 'top-left', left: vp.x + MARGIN, top: vp.y + MARGIN },
  ];
  const covers = (corner) => target
    && corner.left < target.left + target.width && corner.left + cardWidth > target.left
    && corner.top < target.top + target.height && corner.top + height > target.top;
  const corner = corners.find(c => !covers(c)) || corners[0];
  return {
    target, sheet: false, placement: 'dock', corner: corner.name, arrow: null,
    width: cardWidth, maxHeight, left: Math.round(corner.left), top: Math.round(corner.top),
  };
}

export default function useTourGeometry({ targets, cardRef, stepKey }) {
  // Joined so a fresh-but-equal array never re-subscribes every listener.
  const targetKey = [].concat(targets).join('|');
  const [geometry, setGeometry] = useState(null);

  useLayoutEffect(() => {
    let frame;
    let observed = null;
    let observedRail = null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const resizeObserver = new ResizeObserver(() => schedule());

    const measure = () => {
      const element = findTarget(targetKey.split('|'));
      // Re-point the observer when the visible anchor changes (pane switch,
      // breakpoint crossing, Export mounting after a build).
      if (element !== observed) {
        if (observed) resizeObserver.unobserve(observed);
        if (element) resizeObserver.observe(element);
        observed = element;
      }
      // Track the side rail too: pinning or unpinning it moves the stage
      // sideways without changing the anchor's own size. (A hover peek floats
      // over the stage and moves nothing.)
      const rail = document.querySelector('.hero-rail');
      if (rail !== observedRail) {
        if (observedRail) resizeObserver.unobserve(observedRail);
        if (rail) resizeObserver.observe(rail);
        observedRail = rail;
      }
      const next = computeGeometry(element, cardRef.current);
      setGeometry(previous => (sameGeometry(previous, next) ? previous : next));
    };
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }

    resizeObserver.observe(document.documentElement);
    if (cardRef.current) resizeObserver.observe(cardRef.current);

    // The pane switch for this step was committed in the same tick; wait one
    // frame so the anchor has its real layout, then bring it on screen.
    const scrollFrame = requestAnimationFrame(() => {
      const element = findTarget(targetKey.split('|'));
      const rect = element?.getBoundingClientRect();
      if (rect && (rect.top < 0 || rect.bottom > window.innerHeight)) {
        element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
      }
      measure();
    });

    // Cheap catch-all for anchors that mount/unmount or change size via class
    // toggles without resizing the document.
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-tour', 'hidden'] });

    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    document.addEventListener('transitionend', schedule, true);
    document.addEventListener('animationend', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrollFrame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      document.removeEventListener('transitionend', schedule, true);
      document.removeEventListener('animationend', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [targetKey, cardRef, stepKey]);

  return geometry;
}
