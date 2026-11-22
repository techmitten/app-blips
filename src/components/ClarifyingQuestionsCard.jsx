import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import {
  OTHER_OPTION_LABEL,
  formatClarifyingAnswers,
  hasRecommendedTag,
  stripRecommendedTag,
} from '../lib/clarifyingQuestions';

const OTHER_CHOICE = '__other__';
const OPTION_SPLIT_RE = /^([^:]{2,48}):\s+(.+)$/;

/**
 * Split an option like "Warm & editorial: cream backgrounds, serif headings"
 * into a scannable title and secondary description for display.
 */
function splitOptionLabel(label) {
  const match = OPTION_SPLIT_RE.exec(label);
  if (!match || match[1].includes('://')) {
    return { title: label, description: '' };
  }
  return { title: match[1].trim(), description: match[2].trim() };
}

export default function ClarifyingQuestionsCard({ questions, onSubmit }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState({});
  const [otherTexts, setOtherTexts] = useState({});

  if (!Array.isArray(questions) || questions.length === 0) return null;

  const safeIndex = Math.min(currentIndex, questions.length - 1);
  const item = questions[safeIndex];
  const isFirst = safeIndex === 0;
  const isLast = safeIndex === questions.length - 1;

  const getAnswer = (qIdx) => {
    const picked = selections[qIdx];
    if (picked === OTHER_CHOICE) return (otherTexts[qIdx] || '').trim();
    if (typeof picked === 'number') return questions[qIdx]?.options?.[picked] || '';
    return '';
  };

  const currentAnswer = getAnswer(safeIndex);
  const allAnswered = questions.every((_q, idx) => Boolean(getAnswer(idx)));
  const selected = selections[safeIndex];
  const isOtherSelected = selected === OTHER_CHOICE;
  const groupLabelId = `clarify-q-${safeIndex}`;

  const handleSelectOption = (choice) => {
    setSelections((prev) => ({ ...prev, [safeIndex]: choice }));
  };

  const handleBack = () => {
    if (!isFirst) setCurrentIndex((idx) => Math.max(0, idx - 1));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isLast) {
      if (!currentAnswer) return;
      setCurrentIndex((idx) => Math.min(questions.length - 1, idx + 1));
      return;
    }
    if (!allAnswered || !onSubmit) return;
    const answers = questions.map((_q, idx) => getAnswer(idx));
    onSubmit(formatClarifyingAnswers(questions, answers));
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Clarifying questions"
      className="animate-fade-in"
    >
      <div className="clarify-card">
        {questions.length > 1 && (
          <div
            className="clarify-progress"
            style={{ gridTemplateColumns: `repeat(${questions.length}, minmax(0, 1fr))` }}
            role="tablist"
            aria-label="Question progress"
          >
            {questions.map((_q, idx) => {
              const answered = Boolean(getAnswer(idx));
              const isCurrent = idx === safeIndex;
              const canJump = idx < safeIndex || answered;
              const state = isCurrent ? 'current' : answered ? 'done' : 'todo';
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!canJump && !isCurrent}
                  onClick={() => setCurrentIndex(idx)}
                  aria-label={`Question ${idx + 1}${answered ? ' (answered)' : ''}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  data-state={state}
                  className="clarify-progress-seg"
                />
              );
            })}
          </div>
        )}

        <div key={safeIndex} className="clarify-body space-y-3.5 animate-fade-in">
          <div className="space-y-1.5">
            {questions.length > 1 && (
              <p className="clarify-step-label">
                Question {safeIndex + 1} of {questions.length}
              </p>
            )}
            <p id={groupLabelId} className="clarify-question">
              {item.question}
            </p>
          </div>

          <div
            role="radiogroup"
            aria-labelledby={groupLabelId}
            className="flex flex-col gap-2"
          >
            {(item.options || []).map((option, optIdx) => {
              const isSelected = selected === optIdx;
              const isRecommended = hasRecommendedTag(option);
              const label = isRecommended ? stripRecommendedTag(option) : option;
              const { title, description } = splitOptionLabel(label);
              return (
                <button
                  key={`${optIdx}-${option}`}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleSelectOption(optIdx)}
                  className="clarify-option"
                >
                  <span className="clarify-radio" aria-hidden="true" />
                  <span className="clarify-option-content min-w-0">
                    <span className="clarify-option-header">
                      <span className="clarify-option-title">{title}</span>
                      {isRecommended && (
                        <span className="clarify-rec-badge">Recommended</span>
                      )}
                    </span>
                    {description && (
                      <span className="clarify-option-desc">{description}</span>
                    )}
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              role="radio"
              aria-checked={isOtherSelected}
              onClick={() => handleSelectOption(OTHER_CHOICE)}
              className="clarify-option"
            >
              <span className="clarify-radio" aria-hidden="true" />
              <span className="clarify-option-title">{OTHER_OPTION_LABEL}</span>
            </button>

            {isOtherSelected && (
              <div className="pt-0.5">
                <input
                  autoFocus
                  type="text"
                  value={otherTexts[safeIndex] || ''}
                  onChange={(e) => setOtherTexts((prev) => ({ ...prev, [safeIndex]: e.target.value }))}
                  placeholder="Type your answer..."
                  aria-label={`Custom answer for question ${safeIndex + 1}`}
                  className="clarify-other-input"
                />
              </div>
            )}
          </div>
        </div>

        <div className="clarify-footer">
          {!isFirst ? (
            <button
              type="button"
              onClick={handleBack}
              className="clarify-back-btn"
            >
              <ArrowLeft size={13} aria-hidden="true" />
              <span>Back</span>
            </button>
          ) : (
            <span />
          )}

          <button
            type="submit"
            disabled={isLast ? !allAnswered : !currentAnswer}
            className="clarify-next-btn"
          >
            <span>{isLast ? 'Continue' : 'Next'}</span>
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>
      </div>
    </form>
  );
}