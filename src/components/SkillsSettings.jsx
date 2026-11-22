import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, MessageCircleQuestion } from 'lucide-react';
import { SettingRow, Switch } from './SettingControls';
import { ConnectorCard } from './ConnectorsSettings';
import { SKILLS as SKILL_DEFINITIONS } from '../lib/skills';

// Settings → Skills: abilities the AI has built in (lib/skills.js). Each skill
// is a card like the ones under Extensions and Tools; a card opens the skill's
// page (switch, how to call it). A skill that is on can also be called from
// the chat at any point in a project, by typing its command (/clarify).
// Only one skill exists, so its state is the `enabled` prop; a second skill
// needs its own state from App.jsx, read where the AI is prompted (lib/llm.js).
const SKILL_PAGES = {
  clarify: {
    Icon: MessageCircleQuestion,
    description: 'While on, the AI asks 2–3 multiple-choice questions about your goals before the initial build of a project, and never again on its own. Type /clarify at the start of a prompt to have it ask at any time, for example before adding a big feature.',
    switchDescription: 'Ask questions before the initial build. /clarify in the chat also needs this on.',
    prompts: [
      '/clarify Add a checkout page',
      '/clarify I want to redesign the home page',
      '/clarify',
    ],
  },
};
const SKILLS = SKILL_DEFINITIONS.map((skill) => ({ ...skill, ...SKILL_PAGES[skill.id], switchLabel: `Enable ${skill.name}` }));

function SkillPrompts({ command, prompts }) {
  const [copied, setCopied] = useState(null);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    if (copied === null) return undefined;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async (index) => {
    try {
      await navigator.clipboard.writeText(prompts[index]);
      setCopyFailed(false);
      setCopied(index);
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <div className="py-4 space-y-2">
      <h4 className="text-sm font-semibold text-slate-900">Prompts to try</h4>
      <p className="text-xs leading-snug text-slate-600">
        Type /{command} at the start of a prompt in the builder chat, or copy one of these. It works once the skill is turned on.
      </p>
      <ul className="space-y-2">
        {prompts.map((prompt, index) => (
          <li key={prompt} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <p className="min-w-0 flex-1 select-all text-xs leading-snug text-slate-800">{prompt}</p>
            <button
              type="button"
              onClick={() => copy(index)}
              aria-label={copied === index ? 'Copied' : `Copy prompt: ${prompt}`}
              className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                copied === index ? 'bg-emerald-500/15 text-emerald-700' : 'text-indigo-600 hover:bg-indigo-500/10'
              }`}
            >
              {copied === index ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              {copied === index ? 'Copied' : 'Copy'}
            </button>
          </li>
        ))}
      </ul>
      {copyFailed && (
        <p role="alert" className="text-xs text-red-600">Couldn’t copy. Click the prompt to select it, then copy it yourself.</p>
      )}
    </div>
  );
}

export default function SkillsSettings({ enabled, onEnabledChange }) {
  const [openId, setOpenId] = useState(null);
  const rootRef = useRef(null);
  const skill = SKILLS.find((s) => s.id === openId);

  if (skill) {
    const { Icon } = skill;
    return (
      <div ref={rootRef}>
        <button
          type="button"
          onClick={() => setOpenId(null)}
          className="-ml-2 mb-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Skills
        </button>
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-indigo-600">
            <Icon size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-900">{skill.name}</h3>
            <p className="mt-0.5 text-xs leading-snug text-slate-600">{skill.description}</p>
          </div>
        </div>
        <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200 pt-4">
          <SettingRow id={`set-skill-${skill.id}`} title={skill.switchLabel} description={skill.switchDescription}>
            <Switch checked={enabled} onChange={onEnabledChange} labelledBy={`set-skill-${skill.id}`} />
          </SettingRow>
          <SkillPrompts command={skill.command} prompts={skill.prompts} />
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      <p className="mb-4 text-xs leading-snug text-slate-600">
        Abilities built into the AI. Turn a skill on to let it work in your projects, and call it from the chat whenever you need it by typing / and its name, for example “/clarify Add a checkout page”.
      </p>
      <div className="grid grid-cols-1 gap-4 rounded-2xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200/70 sm:grid-cols-2 sm:p-4">
        {SKILLS.map((s) => (
          <ConnectorCard
            key={s.id}
            name={s.name}
            tagline={s.tagline}
            Icon={s.Icon}
            status={enabled ? 'connected' : 'off'}
            tool
            onClick={() => setOpenId(s.id)}
          />
        ))}
      </div>
    </div>
  );
}
