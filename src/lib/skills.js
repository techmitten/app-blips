// Skills: abilities built into the AI, listed in Settings → Skills. A skill
// that is on can be called from the chat by typing its command at the start
// of a prompt ("/clarify what should the checkout page include?"); lib/llm.js
// runs it. Framework-free: the settings page adds the icons and prompts, and
// the chat box reads SKILLS for its command menu.
import { loadAskClarifyingQuestions } from './config.js';

export const SKILLS = [
  {
    id: 'clarify',
    command: 'clarify',
    name: 'Clarify',
    tagline: 'The AI asks a few multiple-choice questions to understand what you need.',
    // One line for the chat box's command menu.
    hint: 'The AI asks you a few questions first',
    isEnabled: loadAskClarifyingQuestions,
  },
];

// "/clarify add a checkout" -> { skill, request: 'add a checkout' }. Only a
// known command at the very start counts; anything else ("/about page", a
// path) is an ordinary prompt and returns null.
export const parseSkillCommand = (prompt) => {
  const match = /^\s*\/([a-z][\w-]*)(?=\s|$)([\s\S]*)$/i.exec(String(prompt || ''));
  if (!match) return null;
  const skill = SKILLS.find((s) => s.command === match[1].toLowerCase());
  return skill ? { skill, request: match[2].trim() } : null;
};

// The prompt without its skill command, for the chat history the AI sees
// later: the command was for AppBlips, the rest is what the user asked.
export const stripSkillCommand = (prompt) => {
  const call = parseSkillCommand(prompt);
  return call ? call.request : prompt;
};

// Skills whose command starts with what the user is typing, for the menu:
// only while the prompt is a lone "/word" (no space typed yet).
export const matchSkillCommands = (prompt) => {
  const match = /^\/([a-z][\w-]*)?$/i.exec(String(prompt || ''));
  if (!match) return [];
  const typed = (match[1] || '').toLowerCase();
  return SKILLS.filter((s) => s.command.startsWith(typed));
};
