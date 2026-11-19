export const MAX_CLARIFYING_QUESTIONS = 3;
export const OTHER_OPTION_LABEL = 'Other';
export const RECOMMENDED_TAG = '(recommended)';

const OTHER_OPTION_RE = /^(other|something else|custom|none of the above)\b/i;
const RECOMMENDED_TAG_RE = /\s*\(\s*recommended\s*\)\s*/gi;

export function stripRecommendedTag(text) {
  return String(text || '').replace(RECOMMENDED_TAG_RE, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Clean and cap the structured clarifying questions returned by the model.
 * - Strips any "Other"-style choice because the UI always appends "Other" with
 *   a free-text input as the last option for every question.
 * - Guarantees the recommended option is always first and tagged with
 *   `(recommended)` (moving a later recommended choice to index 0, or tagging
 *   index 0 if the model omitted the tag).
 */
export function normalizeClarifyingQuestions(rawQuestions) {
  if (!Array.isArray(rawQuestions)) return [];

  const normalized = [];
  for (const item of rawQuestions) {
    if (normalized.length >= MAX_CLARIFYING_QUESTIONS) break;
    if (!item || typeof item !== 'object') continue;

    const question = typeof item.question === 'string' ? item.question.trim() : '';
    if (!question) continue;

    const rawOptions = Array.isArray(item.options) ? item.options : [];
    const seen = new Set();
    const cleaned = [];
    let recommendedIdx = -1;

    for (const rawOpt of rawOptions) {
      const rawText = typeof rawOpt === 'string'
        ? rawOpt.trim()
        : (rawOpt && typeof rawOpt === 'object' && typeof rawOpt.label === 'string' ? rawOpt.label.trim() : '');
      if (!rawText) continue;

      const wasRecommended = RECOMMENDED_TAG_RE.test(rawText);
      RECOMMENDED_TAG_RE.lastIndex = 0;

      const opt = stripRecommendedTag(rawText);
      if (!opt) continue;
      if (OTHER_OPTION_RE.test(opt)) continue;
      const key = opt.toLowerCase();
      if (seen.has(key)) {
        if (wasRecommended && recommendedIdx === -1) {
          recommendedIdx = cleaned.findIndex((existing) => existing.toLowerCase() === key);
        }
        continue;
      }
      seen.add(key);
      if (wasRecommended && recommendedIdx === -1) {
        recommendedIdx = cleaned.length;
      }
      cleaned.push(opt);
      if (cleaned.length >= 5) break;
    }

    if (cleaned.length > 0) {
      if (recommendedIdx > 0) {
        const [recommended] = cleaned.splice(recommendedIdx, 1);
        cleaned.unshift(recommended);
      }
      cleaned[0] = `${cleaned[0]} ${RECOMMENDED_TAG}`;
    }

    normalized.push({ question, options: cleaned });
  }

  return normalized;
}

/**
 * Readable Markdown representation stored on `version.reply` so chat history,
 * copy-message, and older transcript turns always have the questions in text.
 */
export function formatClarifyingQuestionsReply(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return '';
  const intro = questions.length === 1
    ? 'Before I build, one quick question:'
    : 'Before I build, a few quick questions:';
  const lines = questions.map((q, index) => `${index + 1}. ${q.question}`);
  return `${intro}\n\n${lines.join('\n')}`;
}

/**
 * Parse tool call arguments from `ask_clarifying_questions`.
 * Supports both the structured `{ questions: [{ question, options }] }` format
 * and the single-question `{ question: "..." }` format (used by the public
 * writing guard and as a fallback if a model ignores the updated schema).
 */
export function parseClarifyingQuestionsArgs(rawArguments) {
  let args;
  let parseError = null;
  try {
    args = typeof rawArguments === 'string' ? JSON.parse(rawArguments) : rawArguments;
  } catch (err) {
    parseError = err;
    args = null;
  }

  const questions = normalizeClarifyingQuestions(args?.questions);
  if (questions.length > 0) {
    const reply = formatClarifyingQuestionsReply(questions);
    return { questions, reply, question: reply, parseError };
  }

  let q = args?.question || 'Could you clarify what you mean?';
  if (typeof q === 'object' && q !== null) q = q.question || Object.values(q)[0] || JSON.stringify(q);
  q = String(q).trim() || 'Could you clarify what you mean?';
  return { questions: null, reply: q, question: q, parseError };
}

/**
 * Format the user's selected/typed multiple-choice answers into a concise
 * message that becomes their next chat turn.
 */
export function formatClarifyingAnswers(questions, answers) {
  if (!Array.isArray(questions) || questions.length === 0) return '';
  return questions
    .map((q, index) => {
      const answer = stripRecommendedTag(answers?.[index] ?? '');
      return `${index + 1}. ${q.question} — ${answer}`;
    })
    .join('\n');
}
