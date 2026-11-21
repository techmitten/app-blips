import { useSyncExternalStore } from 'react';
import { formatTokenCount, getLiveUsage, subscribeLiveUsage, usageTotal } from '../lib/tokenUsage';

const exact = (n) => Math.round(n).toLocaleString();

// What the details say, line by line. Shown on hover, and read out in full by
// screen readers.
const describeUsage = (usage) => {
  const lines = [`Estimated tokens used in this chat: ${exact(usage.total)}`];
  const cache = [
    usage.cached ? `${exact(usage.cached)} read from the AI's cache` : '',
    usage.cacheWrite ? `${exact(usage.cacheWrite)} written to it` : '',
  ].filter(Boolean).join(', ');
  lines.push(`Input: ${exact(usage.input)}${cache ? ` (${cache})` : ''}`);
  lines.push(`Output: ${exact(usage.output)} (including any thinking)`);
  if (usage.estimated) {
    lines.push(usage.running
      ? `About ${exact(usage.estimated)} estimated until the AI provider reports the exact count`
      : `About ${exact(usage.estimated)} estimated: the AI provider didn't report these`);
  }
  if (usage.lastTurn?.calls) {
    lines.push(`${usage.running ? 'This message so far' : 'Your last message'}: ${exact(usageTotal(usage.lastTurn))}`);
  }
  lines.push(
    '',
    'Tokens are how AI providers measure and bill usage. Every request sends your code and AppBlips\' instructions along, so input is usually most of it.',
    'This is an estimate only, not a bill. Always check your AI provider\'s usage or billing page for what you actually pay.',
  );
  return lines.join('\n');
};

// The current chat's token total, in the Build pane's header. It counts up
// while the AI works. Always labelled an estimate: it sums what providers
// report, which isn't the bill (the details say to check the provider).
export default function ChatTokenUsage() {
  const usage = useSyncExternalStore(subscribeLiveUsage, getLiveUsage);
  if (!usage || (!usage.total && !usage.running)) return null;
  const details = describeUsage(usage);
  return (
    <span
      className="chat-token-usage block min-w-0 truncate px-2 text-xs 2xl:text-sm font-medium tabular-nums text-slate-500 dark:text-white/60 cursor-default"
      title={details}
      aria-label={details}
      role="note"
      tabIndex={0}
    >
      Est. {formatTokenCount(usage.total)} tokens
    </span>
  );
}
