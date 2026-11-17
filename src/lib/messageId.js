// One id per chat message the user sends. Every request that message causes
// (the AI's turns, tool calls, automatic repairs) carries it in a header, so
// the Free option's limiter (electron/server/freeLimits.js) counts the message
// once instead of counting what the AI does with it.
const HEADER = 'x-appblips-message';
let current = '';

const newId = () => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

// Call when the user sends a prompt (not for automatic follow-ups).
export const startUserMessage = () => { current = newId(); };

// Headers for a request; `standalone` is for a one-off request that isn't part
// of a message (a "Test connection"), which gets an id of its own.
export const messageHeaders = ({ standalone = false } = {}) => ({ [HEADER]: standalone || !current ? newId() : current });
