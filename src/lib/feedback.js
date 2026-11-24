// "Send feedback" (the side rail) emails the AppBlips team
// through Web3Forms (lib/appblipsInbox.js) with the feedback key.
import {
  APPBLIPS_FEEDBACK_KEY, COOLDOWN_MS, EMAIL_RE, looksLikeBot, postToAppBlipsInbox,
} from './appblipsInbox.js';

export const MAX_FEEDBACK_LENGTH = 3000;
export const FEEDBACK_TYPES = ['Idea', 'Problem', 'Praise', 'Other'];

// '' when the form can be sent, otherwise what to fix.
export const validateFeedback = ({ message = '', email = '' }) => {
  if (!message.trim()) return 'Write your feedback before sending.';
  if (email.trim() && !EMAIL_RE.test(email.trim())) return 'That email address doesn’t look right. Fix it or leave it empty.';
  return '';
};

const SENT_MESSAGE = 'Thanks! Your feedback was sent.';
let lastSentAt = -Infinity;

// Resolves to { ok, message }; never throws. `message` is shown to the user.
export const sendFeedback = async (
  { type = 'Other', message = '', email = '', botcheck = false, openedAt = -Infinity },
  { fetchImpl = fetch, signal, now = Date.now } = {},
) => {
  const problem = validateFeedback({ message, email });
  if (problem) return { ok: false, message: problem };
  const time = now();
  if (looksLikeBot({ botcheck, openedAt }, time)) return { ok: true, message: SENT_MESSAGE };
  if (time - lastSentAt < COOLDOWN_MS) {
    return { ok: false, message: 'You just sent feedback. Please wait a minute before sending more.' };
  }
  const kind = FEEDBACK_TYPES.includes(type) ? type : 'Other';
  const fields = {
    subject: `AppBlips feedback: ${kind}`,
    type: kind,
    message: message.trim().slice(0, MAX_FEEDBACK_LENGTH),
  };
  // Web3Forms uses `email` as the reply-to address, so only send one if given.
  if (email.trim()) fields.email = email.trim();
  const result = await postToAppBlipsInbox(fields, { fetchImpl, signal, accessKey: APPBLIPS_FEEDBACK_KEY });
  if (!result.ok) return result;
  lastSentAt = time;
  return { ok: true, message: SENT_MESSAGE };
};
