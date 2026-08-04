import { useState } from 'react';
import { LIMITS, SKILL_LEVEL, SKILL_LEVEL_VALUES } from '@verihire/shared';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input, Select } from '../../components/ui/Input.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';

/**
 * Skills.
 *
 * ★ The endpoint is a PUT — it replaces the whole list — so this component holds the entire
 * array in local state and saves once. The alternative, a request per chip, means a dropped
 * connection halfway through leaves the server holding a list the user never assembled.
 *
 * Duplicates are rejected case-insensitively here as well as on the server. Doing it locally
 * is not redundant: silently swallowing "react" after "React" server-side looks like the app
 * lost the entry.
 *
 * @param {{value: Array<{name: string, level?: string}>, onSave: (skills: any[]) => void,
 *          isSaving?: boolean, error?: string|null}} props
 */
export const SkillsEditor = ({ value = [], onSave, isSaving, error }) => {
  const [skills, setSkills] = useState(() => value.map((s) => ({ name: s.name, level: s.level ?? '' })));
  const [draft, setDraft] = useState('');
  const [level, setLevel] = useState('');
  const [localError, setLocalError] = useState(null);

  const isDirty = JSON.stringify(skills) !== JSON.stringify(value.map((s) => ({ name: s.name, level: s.level ?? '' })));

  const add = () => {
    const name = draft.trim();
    if (!name) return;

    if (skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setLocalError(`"${name}" is already on your list.`);
      return;
    }
    if (skills.length >= LIMITS.MAX_SKILLS) {
      setLocalError(`You can list up to ${LIMITS.MAX_SKILLS} skills.`);
      return;
    }

    setSkills((prev) => [...prev, { name, level }]);
    setDraft('');
    setLocalError(null);
  };

  const remove = (name) => {
    setSkills((prev) => prev.filter((s) => s.name !== name));
    setLocalError(null);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <Input
            label="Add a skill"
            value={draft}
            maxLength={60}
            placeholder="React, Kubernetes, Financial modelling…"
            onChange={(event) => setDraft(event.target.value)}
            // Enter adds the skill rather than submitting the surrounding form — otherwise
            // typing a skill and hitting Enter saves the page with the skill still in the box.
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
          />
        </div>
        <div className="w-40">
          <Select
            label="Level"
            value={level}
            placeholder="Not specified"
            onChange={(event) => setLevel(event.target.value)}
            options={SKILL_LEVEL_VALUES.map((v) => ({ value: v, label: titleCase(v) }))}
          />
        </div>
        <Button variant="secondary" onClick={add} disabled={!draft.trim()} className="mb-5">
          Add
        </Button>
      </div>

      {(localError || error) && (
        <Alert tone="warning" className="mb-3">
          {localError ?? error}
        </Alert>
      )}

      {skills.length === 0 ? (
        <p className="text-sm text-muted">
          No skills yet. Employers filter candidate search by skill, so an empty list means you
          will not appear in most of it.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <li key={skill.name}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-1 pl-3 pr-1 text-sm">
                {skill.name}
                {skill.level && (
                  <Badge tone="neutral" size="sm">
                    {titleCase(skill.level)}
                  </Badge>
                )}
                <button
                  type="button"
                  onClick={() => remove(skill.name)}
                  aria-label={`Remove ${skill.name}`}
                  className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-elevated hover:text-ink"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {skills.length}/{LIMITS.MAX_SKILLS} · saved as a set, so removals take effect too
        </p>
        <Button disabled={!isDirty} isLoading={isSaving} onClick={() => onSave(skills.map(clean))}>
          Save skills
        </Button>
      </div>
    </div>
  );
};

/** The API rejects an empty-string level; omit the key instead of sending `''`. */
const clean = (skill) => (skill.level ? { name: skill.name, level: skill.level } : { name: skill.name });

const titleCase = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

export { SKILL_LEVEL };
export default SkillsEditor;
