import { useState } from 'react';
import {
  EMPLOYMENT_TYPE_META,
  EMPLOYMENT_TYPE_VALUES,
  LIMITS,
  WORK_MODE_META,
  WORK_MODE_VALUES,
} from '@verihire/shared';
import { Button } from '../../components/ui/Button.jsx';
import { Input, Textarea, Select, Checkbox } from '../../components/ui/Input.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Alert, EmptyState } from '../../components/ui/Feedback.jsx';
import { ProvenanceChip } from './ProvenanceChip.jsx';

/**
 * One editor for all five repeating profile sections.
 *
 * The alternative — five near-identical components — is exactly where `description` ends up
 * with a maxlength on experience and none on projects, and where one section quietly forgets
 * to confirm before deleting. The server takes the same view: a single `itemFields` rule set
 * covers every collection.
 *
 * ★ Deletion asks first and names the entry. These lists are typed by hand over an hour and
 * there is no undo endpoint; an unguarded × next to an edit button is a data-loss bug waiting
 * for a mis-tap on a phone.
 */

/**
 * ★ Declared above COLLECTION_SCHEMA, and it has to stay there.
 *
 * The schema calls this while it is being built — `options: [...].map((v) => titleCase(v))`
 * runs at module scope, not on render. `const` bindings hoist without initialising, so with
 * the definition further down the file the call landed in the temporal dead zone and threw
 * `Cannot access 'titleCase' before initialization` as the module evaluated. That takes the
 * whole chunk with it: every import of this file fails, React.lazy rejects, and the profile
 * page renders nothing at all.
 *
 * The uses inside `title`/`subtitle` are safe either way, because those run on render. It is
 * only the eager one in `options` that matters, which is exactly what made this easy to
 * write and hard to see.
 */
const titleCase = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

/** Field definitions per collection. Order here is the order on screen. */
export const COLLECTION_SCHEMA = {
  experience: {
    label: 'Work experience',
    singular: 'role',
    max: LIMITS.MAX_EXPERIENCE_ENTRIES,
    title: (item) => item.title || 'Untitled role',
    subtitle: (item) => [item.company, item.location].filter(Boolean).join(' · '),
    fields: [
      { key: 'title', label: 'Job title', type: 'text', required: true, half: true },
      { key: 'company', label: 'Company', type: 'text', required: true, half: true },
      {
        key: 'employmentType',
        label: 'Employment type',
        type: 'select',
        half: true,
        options: EMPLOYMENT_TYPE_VALUES.map((v) => ({ value: v, label: EMPLOYMENT_TYPE_META[v].label })),
      },
      {
        key: 'workMode',
        label: 'Work mode',
        type: 'select',
        half: true,
        options: WORK_MODE_VALUES.map((v) => ({ value: v, label: WORK_MODE_META[v].label })),
      },
      { key: 'location', label: 'Location', type: 'text', half: true },
      { key: 'startDate', label: 'Started', type: 'month', half: true },
      { key: 'isCurrent', label: 'I currently work here', type: 'checkbox' },
      { key: 'endDate', label: 'Ended', type: 'month', half: true, hideWhen: 'isCurrent' },
      {
        key: 'description',
        label: 'What you did',
        type: 'textarea',
        maxLength: LIMITS.MAX_DESCRIPTION_LENGTH,
        hint: 'What you were responsible for and what changed because you were there.',
      },
    ],
  },

  education: {
    label: 'Education',
    singular: 'qualification',
    max: LIMITS.MAX_EDUCATION_ENTRIES,
    title: (item) => item.degree || 'Qualification',
    subtitle: (item) => [item.institution, item.fieldOfStudy].filter(Boolean).join(' · '),
    fields: [
      { key: 'degree', label: 'Degree', type: 'text', required: true, half: true },
      { key: 'institution', label: 'Institution', type: 'text', required: true, half: true },
      { key: 'fieldOfStudy', label: 'Field of study', type: 'text', half: true },
      { key: 'grade', label: 'Grade', type: 'text', half: true },
      { key: 'startYear', label: 'Start year', type: 'year', half: true },
      { key: 'endYear', label: 'End year', type: 'year', half: true },
      { key: 'description', label: 'Notes', type: 'textarea', maxLength: LIMITS.MAX_DESCRIPTION_LENGTH },
    ],
  },

  projects: {
    label: 'Projects',
    singular: 'project',
    max: LIMITS.MAX_PROJECT_ENTRIES,
    title: (item) => item.name || 'Untitled project',
    subtitle: (item) => (item.techStack ?? []).join(', '),
    fields: [
      { key: 'name', label: 'Project name', type: 'text', required: true },
      { key: 'description', label: 'What it does', type: 'textarea', maxLength: LIMITS.MAX_DESCRIPTION_LENGTH },
      { key: 'techStack', label: 'Built with', type: 'tags', hint: 'Comma separated.' },
      { key: 'url', label: 'Live URL', type: 'url', half: true },
      { key: 'repoUrl', label: 'Repository', type: 'url', half: true },
    ],
  },

  certifications: {
    label: 'Certifications',
    singular: 'certification',
    max: LIMITS.MAX_CERTIFICATION_ENTRIES,
    title: (item) => item.name || 'Certification',
    subtitle: (item) => item.issuer ?? '',
    fields: [
      { key: 'name', label: 'Certification', type: 'text', required: true, half: true },
      { key: 'issuer', label: 'Issued by', type: 'text', required: true, half: true },
      { key: 'issueDate', label: 'Issued', type: 'month', half: true },
      { key: 'expiryDate', label: 'Expires', type: 'month', half: true },
      { key: 'credentialId', label: 'Credential ID', type: 'text', half: true },
      { key: 'credentialUrl', label: 'Verification link', type: 'url', half: true },
    ],
  },

  languages: {
    label: 'Languages',
    singular: 'language',
    max: LIMITS.MAX_LANGUAGE_ENTRIES,
    title: (item) => item.name || 'Language',
    subtitle: (item) => titleCase(item.proficiency ?? ''),
    fields: [
      { key: 'name', label: 'Language', type: 'text', required: true, half: true },
      {
        key: 'proficiency',
        label: 'Proficiency',
        type: 'select',
        half: true,
        options: ['BASIC', 'CONVERSATIONAL', 'PROFESSIONAL', 'NATIVE'].map((v) => ({
          value: v,
          label: titleCase(v),
        })),
      },
    ],
  },
};

/**
 * @param {{collection: keyof typeof COLLECTION_SCHEMA, items: any[],
 *          onAdd: Function, onUpdate: Function, onRemove: Function,
 *          pendingId?: string|null, error?: string|null}} props
 */
export const CollectionEditor = ({ collection, items = [], onAdd, onUpdate, onRemove, pendingId, error }) => {
  const schema = COLLECTION_SCHEMA[collection];
  /** `'new'` while adding, an item id while editing, `null` when idle. */
  const [editing, setEditing] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(null);

  const atLimit = items.length >= schema.max;

  return (
    <div>
      {error && (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      )}

      {items.length === 0 && editing !== 'new' ? (
        <EmptyState
          size="sm"
          title={`No ${schema.label.toLowerCase()} yet`}
          description={`Add your first ${schema.singular}, or upload a resume and we'll suggest entries for you to review.`}
          action={{ label: `Add ${schema.singular}`, onClick: () => setEditing('new') }}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id ?? item._id}>
              {editing === (item.id ?? item._id) ? (
                <ItemForm
                  schema={schema}
                  initial={item}
                  isSaving={pendingId === (item.id ?? item._id)}
                  onCancel={() => setEditing(null)}
                  onSubmit={(values) => {
                    onUpdate(item.id ?? item._id, values);
                    setEditing(null);
                  }}
                />
              ) : (
                <Card className="relative flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-medium text-ink">{schema.title(item)}</h4>
                      {/* Per-entry provenance: `source` lives on the subdocument itself. */}
                      <ProvenanceChip source={item.source} />
                    </div>
                    {schema.subtitle(item) && (
                      <p className="mt-0.5 text-sm text-muted">{schema.subtitle(item)}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted">{dateRange(item)}</p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(item.id ?? item._id)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmingDelete(item.id ?? item._id)}
                    >
                      Remove
                    </Button>
                  </div>

                  {/* Confirmation names the entry — "are you sure?" alone is not a question. */}
                  {confirmingDelete === (item.id ?? item._id) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-surface/95 p-4 text-center">
                      <p className="text-sm">
                        Remove <strong>{schema.title(item)}</strong>? This cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(null)}>
                          Keep it
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          isLoading={pendingId === (item.id ?? item._id)}
                          onClick={() => {
                            onRemove(item.id ?? item._id);
                            setConfirmingDelete(null);
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing === 'new' && (
        <div className="mt-3">
          <ItemForm
            schema={schema}
            initial={{}}
            isSaving={pendingId === 'new'}
            onCancel={() => setEditing(null)}
            onSubmit={(values) => {
              onAdd(values);
              setEditing(null);
            }}
          />
        </div>
      )}

      {editing !== 'new' && items.length > 0 && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          disabled={atLimit}
          onClick={() => setEditing('new')}
        >
          Add another {schema.singular}
        </Button>
      )}

      {atLimit && (
        <p className="mt-2 text-xs text-muted">
          You have reached the limit of {schema.max}. Remove one to add another.
        </p>
      )}
    </div>
  );
};

/**
 * Add / edit form for a single entry.
 *
 * Uncontrolled-ish local state rather than react-hook-form: the field list is data, and
 * `register()` over a dynamic schema buys nothing here while costing a re-render dance every
 * time the collection changes.
 */
const ItemForm = ({ schema, initial, onSubmit, onCancel, isSaving }) => {
  const [values, setValues] = useState(() => hydrate(schema, initial));

  const set = (key, value) => setValues((prev) => ({ ...prev, [key]: value }));

  const missing = schema.fields
    .filter((field) => field.required && !String(values[field.key] ?? '').trim())
    .map((field) => field.label);

  return (
    <Card className="border-brand-500">
      <div className="grid gap-x-4 sm:grid-cols-2">
        {schema.fields.map((field) => {
          // A hidden field must also be cleared, not merely hidden: "I work here now" with a
          // leftover end date is a contradiction the server would happily store.
          if (field.hideWhen && values[field.hideWhen]) return null;

          return (
            <div key={field.key} className={field.half ? '' : 'sm:col-span-2'}>
              <FieldControl field={field} value={values[field.key]} onChange={(v) => set(field.key, v)} />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        {missing.length > 0 && (
          <p className="mr-auto text-xs text-muted">Still needed: {missing.join(', ')}</p>
        )}
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={missing.length > 0}
          isLoading={isSaving}
          onClick={() => onSubmit(serialise(schema, values))}
        >
          Save
        </Button>
      </div>
    </Card>
  );
};

const FieldControl = ({ field, value, onChange }) => {
  const common = {
    label: field.label,
    required: field.required,
    hint: field.hint,
    value: value ?? '',
    onChange: (event) => onChange(event.target.value),
  };

  switch (field.type) {
    case 'textarea':
      return <Textarea {...common} maxLength={field.maxLength} />;
    case 'select':
      return <Select {...common} options={field.options} placeholder="Not specified" />;
    case 'checkbox':
      return (
        <div className="mb-4">
          <Checkbox
            label={field.label}
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
          />
        </div>
      );
    case 'month':
      return <Input {...common} type="month" />;
    case 'year':
      return <Input {...common} type="number" min={1950} max={2100} inputMode="numeric" />;
    case 'url':
      return <Input {...common} type="url" placeholder="https://" />;
    case 'tags':
      return (
        <Input
          {...common}
          onChange={(event) => onChange(event.target.value)}
          placeholder="React, PostgreSQL, Docker"
        />
      );
    default:
      return <Input {...common} type="text" />;
  }
};

/* ----------------------------------------------------------------- mapping */

/**
 * API shape → form shape.
 *
 * `<input type="month">` needs `YYYY-MM`; the API sends full ISO timestamps. Feeding it an
 * ISO string produces a blank control with no error — the field silently appears empty and
 * the user's date is lost on the next save.
 */
const hydrate = (schema, item) => {
  const out = {};
  for (const field of schema.fields) {
    const raw = item[field.key];
    if (field.type === 'month') out[field.key] = raw ? String(raw).slice(0, 7) : '';
    else if (field.type === 'tags') out[field.key] = Array.isArray(raw) ? raw.join(', ') : '';
    else if (field.type === 'checkbox') out[field.key] = Boolean(raw);
    else out[field.key] = raw ?? '';
  }
  return out;
};

/**
 * Form shape → API shape.
 *
 * Empty strings become `null`, not omitted: the validators accept `null` to mean "clear this",
 * and omitting the key would leave a value the user just deleted sitting in the database.
 */
const serialise = (schema, values) => {
  const out = {};
  for (const field of schema.fields) {
    const raw = values[field.key];

    if (field.hideWhen && values[field.hideWhen]) {
      out[field.key] = null;
      continue;
    }

    if (field.type === 'checkbox') out[field.key] = Boolean(raw);
    else if (field.type === 'tags') {
      out[field.key] = String(raw ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (field.type === 'month') {
      // `YYYY-MM` → the first of that month, in UTC. Without the explicit day the browser
      // parses it as local midnight and a UTC-negative timezone shifts it a month back.
      out[field.key] = raw ? new Date(`${raw}-01T00:00:00.000Z`).toISOString() : null;
    } else if (field.type === 'year') out[field.key] = raw ? Number(raw) : null;
    else out[field.key] = String(raw ?? '').trim() || null;
  }
  return out;
};

const dateRange = (item) => {
  const from = item.startDate ?? item.startYear ?? item.issueDate;
  const to = item.isCurrent ? 'Present' : item.endDate ?? item.endYear ?? item.expiryDate;
  if (!from && !to) return '';
  return [monthLabel(from), monthLabel(to)].filter(Boolean).join(' – ');
};

const monthLabel = (value) => {
  if (!value) return '';
  if (value === 'Present') return value;
  if (typeof value === 'number') return String(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

export default CollectionEditor;
