import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';

// The Build/Ask mode key: one slot-machine reel with two stops; clicking it
// advances Build -> Ask -> Build. It sits in the build pane's header, and in
// the rail's top bar below lg, where that header is folded away. The home
// page has none: a first message always builds.
const MODE_SEQUENCE = ['build', 'ask'];
const STOPS = MODE_SEQUENCE.length;
const MODE_LABELS = { build: 'Build', ask: 'Ask' };
const MODE_INDEX = Object.fromEntries(MODE_SEQUENCE.map((mode, index) => [mode, index]));
// No extra full turns: with only two stops, spinning past the target before
// landing on it just made the other label flash by on the way, which read as
// the reel overshooting its own selection. Moving straight to the next stop
// keeps the slide but drops the detour.
const REEL_EXTRA_ITEMS = 0;
const REEL_NORMALIZE_AT = 30;  // a multiple of the stop count; rewind here to keep it finite
const REEL_ITEM_COUNT = 40;
const REEL_ITEMS = Array.from({ length: REEL_ITEM_COUNT }, (_, i) => MODE_SEQUENCE[i % STOPS]);

export default function ChatModeToggle({ chatMode, onChatModeChange, disabled = false, className = '' }) {
  const selectedMode = chatMode === 'ask' ? 'ask' : 'build';
  const [reelIndex, setReelIndex] = useState(MODE_INDEX[selectedMode]);
  const [spinning, setSpinning] = useState(false);
  const [lastMode, setLastMode] = useState(selectedMode);
  if (lastMode !== selectedMode) {
    setLastMode(selectedMode);
    setSpinning(true);
    setReelIndex((index) => {
      const delta = ((MODE_INDEX[selectedMode] - (index % STOPS)) % STOPS + STOPS) % STOPS;
      return index + delta + REEL_EXTRA_ITEMS;
    });
  }
  const handleReelEnd = (event) => {
    if (event.propertyName !== 'transform') return;
    setSpinning(false);
    setReelIndex((index) => (index >= REEL_NORMALIZE_AT ? index - REEL_NORMALIZE_AT : index));
  };
  const cycleMode = () => {
    const next = MODE_SEQUENCE[(MODE_INDEX[selectedMode] + 1) % STOPS];
    if (next !== chatMode) onChatModeChange(next);
  };

  return (
    <button
      type="button"
      data-tour="mode"
      onClick={cycleMode}
      disabled={disabled}
      aria-label={`${MODE_LABELS[selectedMode]} mode. Activate to switch mode.`}
      title={`${MODE_LABELS[selectedMode]} mode — click to switch`}
      className={`chat-mode-reel${spinning ? ' is-spinning' : ''}${className ? ` ${className}` : ''}`}
    >
      <span className="chat-mode-reel-window" aria-hidden="true">
        <span
          className={`chat-mode-reel-track ${spinning ? 'is-spinning' : ''}`}
          style={{ transform: `translateY(calc(${-reelIndex} * var(--composer-key-size)))` }}
          onTransitionEnd={handleReelEnd}
        >
          {REEL_ITEMS.map((word, index) => (
            <span key={index} className="chat-mode-reel-item">{MODE_LABELS[word]}</span>
          ))}
        </span>
      </span>
      {/* Up/down marks the key as a switch rather than a label. */}
      <ChevronsUpDown size={12} strokeWidth={2.25} aria-hidden="true" className="chat-mode-reel-hint" />
    </button>
  );
}
