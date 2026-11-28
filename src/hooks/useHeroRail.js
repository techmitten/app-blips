import { useEffect, useRef, useState } from 'react';
import { loadHeroRailCollapsed, saveHeroRailCollapsed } from '../lib/config';

// Hover intent for the side rail: a short wait before it opens, so sweeping
// the pointer past it on the way to the window edge doesn't flash it open,
// and a longer grace before it closes, so a brief overshoot doesn't either.
const RAIL_OPEN_DELAY_MS = 120;
const RAIL_CLOSE_DELAY_MS = 240;

// State for HeroSidebar (shown by the studio shell, HeroLanding). Pinned keeps the rail open and gives it room in the layout;
// otherwise it stays an icon strip and peeks open over the stage on hover or
// keyboard focus, so the page never reflows underneath the pointer. Returns
// the props to spread onto HeroSidebar.
export default function useHeroRail() {
  const [pinned, setPinned] = useState(() => !loadHeroRailCollapsed());
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const hoverTimerRef = useRef(null);
  const peeking = !pinned && (hovered || focused);
  useEffect(() => () => clearTimeout(hoverTimerRef.current), []);

  return {
    collapsed: !pinned && !peeking,
    pinned,
    peeking,
    onToggleCollapsed: () => {
      setPinned((prev) => {
        saveHeroRailCollapsed(prev);
        return !prev;
      });
    },
    onMouseEnter: () => {
      clearTimeout(hoverTimerRef.current);
      if (hovered) return;
      hoverTimerRef.current = setTimeout(() => setHovered(true), RAIL_OPEN_DELAY_MS);
    },
    onMouseLeave: () => {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = setTimeout(() => setHovered(false), RAIL_CLOSE_DELAY_MS);
    },
    // Keyboard users get the labels too: tabbing into the rail opens it, and
    // leaving it (or Escape) closes it. A mouse click focuses without
    // :focus-visible, so clicking a key doesn't count as a keyboard peek.
    onFocus: (event) => {
      if (event.target.matches?.(':focus-visible')) setFocused(true);
    },
    // A rail popover (a saved project's ⋯ menu) is portaled out of the rail
    // but still counts as inside it.
    onBlur: (event) => {
      if (event.relatedTarget?.closest?.('[data-hero-rail-popover]')) return;
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
    },
    onKeyDown: (event) => {
      if (event.key === 'Escape' && peeking && !event.defaultPrevented) {
        clearTimeout(hoverTimerRef.current);
        setFocused(false);
        setHovered(false);
      }
    },
  };
}
