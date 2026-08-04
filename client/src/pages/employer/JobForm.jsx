import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CURRENCY_META,
  CURRENCY_VALUES,
  EDUCATION_LEVEL_META,
  EDUCATION_LEVEL_VALUES,
  EMPLOYMENT_TYPE_META,
  EMPLOYMENT_TYPE_VALUES,
  ERROR_CODES,
  INDUSTRIES,
  JOB_MATERIAL_FIELDS,
  JOB_STATUS,
  LIMITS,
  SALARY_PERIOD_VALUES,
  WORK_MODE,
  WORK_MODE_META,
  WORK_MODE_VALUES,
} from '@verihire/shared';

import { jobApi } from '../../api/services/index.js';
import { ROUTES } from '../../routes/paths.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input, Textarea, Select, Checkbox, Label } from '../../components/ui/Input.jsx';
import { PageHeader, Card, CardHeader } from '../../components/ui/Card.jsx';
import { Alert, ErrorState, Skeleton } from '../../components/ui/Feedback.jsx';
import { JobStatusBadge } from '../../components/ui/Badge.jsx';
import { cn } from '../../utils/cn.js';

/**
 * Post or edit a job. One component, two modes — `:id` present means edit.
 *
 * ★ Two things about this form are unusual, and both come from the approval gate.
 *
 * **Saving is not publishing.** Every save writes a DRAFT. "Submit for review" is a separate,
 * deliberate second action. An employer who fills this in and closes the tab has lost nothing
 * and published nothing.
 *
 * **Editing an approved listing un-publishes it.** The material-edit rule sends a substantively
 * changed live job back to PENDING — that is what stops "get one clean job approved, then
 * rewrite it into whatever you wanted". This form warns *before* the save, not after, and
 * marks which fields carry that consequence, because discovering your live listing went dark
 * after fixing a typo would be indistinguishable from a bug.
 */
export const JobForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);

  const { data: job, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['employer', 'job', id],
    queryFn: () => jobApi.get(id),
    enabled: isEdit,
  });

  if (isEdit && isLoading) return <Skeleton className="h-96" />;
  if (isEdit && isError) return <ErrorState message={error?.message} onRetry={refetch} />;

  return (
    <JobFormInner
      key={job?.id ?? 'new'}
      job={job}
      onSaved={(saved) => {
        queryClient.invalidateQueries({ queryKey: ['employer'] });
        if (!isEdit) navigate(`/employer/jobs/${saved.id}/edit`, { replace: true });
      }}
      onSubmitted={() => {
        queryClient.invalidateQueries({ queryKey: ['employer'] });
        navigate(ROUTES.EMPLOYER_JOBS);
      }}
    />
  );
};

const JobFormInner = ({ job, onSaved, onSubmitted }) => {
  const [showMaterialWarning, setShowMaterialWarning] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    control,
    reset,
    setError,
    formState: { errors, isDirty, dirtyFields },
  } = useForm({ defaultValues: toForm(job) });

  const workMode = watch('workMode');
  const isDisclosed = watch('salary.isDisclosed');
  const description = watch('description') ?? '';

  const save = useMutation({
    mutationFn: (/** @type {Record<string, any>} */ payload) =>
      job ? jobApi.update(job.id, payload) : jobApi.create(payload),
    onSuccess: (data) => {
      /*
       * The server tells us whether the edit was material. Trusting a client-side comparison
       * here would drift the moment JOB_MATERIAL_FIELDS changes on one side only.
       */
      if (data?.requiresReReview) setShowMaterialWarning(true);
      reset(toForm(data?.job ?? data));
      onSaved(data?.job ?? data);
    },
    onError: (error) => applyFieldErrors(error, setError),
  });

  const submit = useMutation({
    mutationFn: () => jobApi.submit(job.id),
    onSuccess: onSubmitted,
  });

  const status = job?.status ?? JOB_STATUS.DRAFT;
  const isLive = status === JOB_STATUS.APPROVED;

  // Which of the fields the user has actually touched carry the un-publish consequence.
  const touchedMaterial = isLive
    ? JOB_MATERIAL_FIELDS.filter((field) => dirtyFields[field])
    : [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={job ? 'Edit listing' : 'Post a job'}
        description={
          job
            ? null
            : 'Saved as a draft first. Nothing is published until you submit it and an admin approves it.'
        }
        breadcrumb={
          <Link to={ROUTES.EMPLOYER_JOBS} className="hover:underline">
            ← Your jobs
          </Link>
        }
        actions={job && <JobStatusBadge status={status} />}
      />

      {status === JOB_STATUS.REJECTED && job?.moderation?.rejectionReason && (
        <Alert tone="danger" title="Why this was rejected" className="mb-4">
          <p className="whitespace-pre-wrap">{job.moderation.rejectionReason}</p>
          <p className="mt-2 text-xs opacity-80">
            Fix the points above and submit again. There is no limit on resubmissions.
          </p>
        </Alert>
      )}

      {status === JOB_STATUS.PENDING && (
        <Alert tone="warning" className="mb-4">
          This listing is waiting for review and is not visible to candidates. Editing it now is
          fine — it stays in the queue.
        </Alert>
      )}

      {/* ★ The warning, before the save rather than after it. */}
      {isLive && touchedMaterial.length > 0 && (
        <Alert tone="warning" title="Saving this will take the listing offline" className="mb-4">
          You have changed {listFields(touchedMaterial)}. Because this job is live, saving sends
          it back for review and hides it from candidates until an admin approves it again —
          usually within a day. Applications already received are unaffected.
        </Alert>
      )}

      {showMaterialWarning && (
        <Alert tone="warning" title="This listing is back in the review queue" className="mb-4">
          Your edit changed the substance of an approved job, so it is hidden until re-reviewed.
        </Alert>
      )}

      <form onSubmit={handleSubmit((values) => save.mutate(toPayload(values)))} className="space-y-4" noValidate>
        <Card>
          <CardHeader title="The role" />
          <div className="mt-4">
            <Input
              label="Job title"
              required
              maxLength={LIMITS.MAX_JOB_TITLE_LENGTH}
              placeholder="Senior Backend Engineer"
              hint="What the role is called. Candidates search on this."
              error={errors.title?.message}
              {...register('title', { required: 'A job title is required' })}
            />

            <Textarea
              label="Description"
              required
              value={description}
              maxLength={LIMITS.MAX_JOB_DESCRIPTION_LENGTH}
              className="min-h-[200px]"
              hint={`What the job actually involves. At least ${LIMITS.MIN_JOB_DESCRIPTION_LENGTH} characters.`}
              error={errors.description?.message}
              {...register('description', {
                required: 'A description is required',
                minLength: {
                  value: LIMITS.MIN_JOB_DESCRIPTION_LENGTH,
                  message: `Describe the role in at least ${LIMITS.MIN_JOB_DESCRIPTION_LENGTH} characters`,
                },
              })}
            />

            <div className="grid gap-x-4 sm:grid-cols-2">
              <Select
                label="Employment type"
                required
                options={EMPLOYMENT_TYPE_VALUES.map((v) => ({ value: v, label: EMPLOYMENT_TYPE_META[v].label }))}
                error={errors.employmentType?.message}
                {...register('employmentType', { required: 'Choose an employment type' })}
              />
              <Select
                label="Work mode"
                required
                options={WORK_MODE_VALUES.map((v) => ({ value: v, label: WORK_MODE_META[v].label }))}
                error={errors.workMode?.message}
                {...register('workMode', { required: 'Choose remote, hybrid or on-site' })}
              />
            </div>

            <div className="grid gap-x-4 sm:grid-cols-3">
              <Input label="City" {...register('location.city')} />
              <Input label="State" {...register('location.state')} />
              <Input label="Country" {...register('location.country')} />
            </div>

            {/*
              Only meaningful for remote roles, and it is a real filter for candidates: "remote"
              that turns out to mean "remote within one state" wastes everybody's time.
            */}
            {workMode === WORK_MODE.REMOTE && (
              <Checkbox
                label="Open to candidates anywhere"
                description="Leave unticked if the role is remote but restricted to a country or region — say which above."
                {...register('location.isRemoteAnywhere')}
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Pay"
            description="Listings with a salary range get substantially more qualified applicants."
          />
          <div className="mt-4">
            <Checkbox
              label="Show the salary range on the listing"
              description="Unticked, candidates see “Not disclosed”. The range is still used for matching."
              {...register('salary.isDisclosed')}
            />

            <div className={cn('mt-4 grid gap-x-4 sm:grid-cols-4', !isDisclosed && 'opacity-60')}>
              <Input type="number" min={0} label="Minimum" {...register('salary.min')} />
              <Input
                type="number"
                min={0}
                label="Maximum"
                error={errors['salary.max']?.message}
                {...register('salary.max')}
              />
              <Select
                label="Currency"
                options={CURRENCY_VALUES.map((v) => ({ value: v, label: `${CURRENCY_META[v].symbol} ${v}` }))}
                {...register('salary.currency')}
              />
              <Select
                label="Per"
                options={SALARY_PERIOD_VALUES.map((v) => ({ value: v, label: v.toLowerCase() }))}
                {...register('salary.period')}
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Who you're looking for" />
          <div className="mt-4">
            <SkillsField control={control} register={register} />

            <div className="grid gap-x-4 sm:grid-cols-2">
              <Input
                type="number"
                min={0}
                max={40}
                label="Minimum experience"
                rightAddon={<span className="pr-2 text-xs text-muted">years</span>}
                {...register('experienceMinYears')}
              />
              <Input
                type="number"
                min={0}
                max={40}
                label="Maximum experience"
                rightAddon={<span className="pr-2 text-xs text-muted">years</span>}
                hint="Leave blank for no upper bound."
                {...register('experienceMaxYears')}
              />
            </div>

            <Select
              label="Minimum education"
              options={EDUCATION_LEVEL_VALUES.map((v) => ({ value: v, label: EDUCATION_LEVEL_META[v].label }))}
              {...register('education.level')}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Details" description="Optional, but these are the parts candidates read closely." />
          <div className="mt-4 space-y-4">
            <ListField
              label="Responsibilities"
              name="responsibilities"
              control={control}
              register={register}
              placeholder="Own the payments service end to end"
            />
            <ListField
              label="Requirements"
              name="requirements"
              control={control}
              register={register}
              placeholder="5+ years building production Node services"
            />
            <ListField
              label="Nice to have"
              name="niceToHave"
              control={control}
              register={register}
              placeholder="Experience with event-driven architectures"
            />
            <ListField
              label="Benefits"
              name="benefits"
              control={control}
              register={register}
              placeholder="Private health cover from day one"
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Logistics" />
          <div className="mt-4 grid gap-x-4 sm:grid-cols-2">
            <Input
              type="date"
              label="Application deadline"
              required
              min={tomorrow()}
              max={maxDeadline()}
              hint="The listing hides itself automatically after this date."
              error={errors.deadline?.message}
              {...register('deadline', { required: 'A deadline is required' })}
            />
            <Input
              type="number"
              min={LIMITS.MIN_OPENINGS}
              max={LIMITS.MAX_OPENINGS}
              label="Openings"
              {...register('openings')}
            />
            <Select
              label="Industry"
              placeholder="Not specified"
              options={INDUSTRIES.map((v) => ({ value: v, label: v }))}
              {...register('industry')}
            />
            <Input label="Department" placeholder="Engineering" {...register('department')} />
          </div>
        </Card>

        {errors.root && <Alert tone="danger">{errors.root.message}</Alert>}
        {save.isError && !errors.root && <Alert tone="danger">{save.error?.message}</Alert>}

        {/*
          ★ Two distinct actions, not one. "Save" is reversible and private; "Submit" is the
          one that starts a review. Collapsing them into a single button would mean an
          employer cannot save a half-written listing without putting it in front of an admin.
        */}
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-bg/95 py-4 backdrop-blur">
          <p className="text-sm text-muted">
            {isDirty ? 'Unsaved changes' : job ? 'All changes saved' : 'Not saved yet'}
          </p>

          <div className="flex gap-2">
            <Button type="submit" variant="secondary" isLoading={save.isPending}>
              {job ? 'Save changes' : 'Save draft'}
            </Button>

            {job && canSubmit(status) && (
              <Button
                // Submitting stale text would put the wrong version in the queue.
                disabled={isDirty}
                isLoading={submit.isPending}
                onClick={() => submit.mutate()}
                title={isDirty ? 'Save your changes first' : undefined}
              >
                Submit for review
              </Button>
            )}
          </div>
        </div>

        {submit.isError && <Alert tone="danger">{mapSubmitError(submit.error)}</Alert>}
      </form>
    </div>
  );
};

/* ------------------------------------------------------------- sub-fields */

/**
 * Repeating single-line list (responsibilities, requirements…).
 *
 * A textarea split on newlines would be less code, but it makes reordering impossible and
 * turns one stray blank line into an empty bullet on a public listing.
 */
const ListField = ({ label, name, control, register, placeholder }) => {
  const { fields, append, remove } = useFieldArray({ control, name });

  return (
    <div>
      <Label>{label}</Label>
      {fields.length === 0 && (
        <p className="mb-2 text-xs text-muted">Nothing added yet.</p>
      )}

      <ul className="space-y-2">
        {fields.map((field, index) => (
          <li key={field.id} className="flex items-center gap-2">
            <Input
              className="flex-1"
              placeholder={placeholder}
              maxLength={LIMITS.MAX_JOB_LIST_ITEM_LENGTH}
              aria-label={`${label} item ${index + 1}`}
              {...register(`${name}.${index}.value`)}
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove ${label} item ${index + 1}`}
              className="mb-5 grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted hover:bg-elevated hover:text-ink"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <Button
        size="sm"
        variant="ghost"
        disabled={fields.length >= LIMITS.MAX_JOB_LIST_ITEMS}
        onClick={() => append({ value: '' })}
      >
        + Add {label.toLowerCase()}
      </Button>
    </div>
  );
};

/**
 * Required skills, each with a mandatory flag.
 *
 * ★ The flag matters downstream: "mandatory" skills are the ones a candidate is told they are
 * missing, and marking everything mandatory is how a listing ends up with no applicants. The
 * hint says so rather than leaving employers to discover it from an empty inbox.
 */
const SkillsField = ({ control, register }) => {
  const { fields, append, remove } = useFieldArray({ control, name: 'skillsRequired' });

  return (
    <div className="mb-4">
      <Label>Skills</Label>
      <p className="mb-2 text-xs text-muted">
        Mark only the ones you would genuinely reject a candidate for lacking.
      </p>

      <ul className="space-y-2">
        {fields.map((field, index) => (
          <li key={field.id} className="flex items-center gap-3">
            <Input
              className="flex-1"
              maxLength={60}
              placeholder="PostgreSQL"
              aria-label={`Skill ${index + 1}`}
              {...register(`skillsRequired.${index}.name`)}
            />
            <div className="mb-5 shrink-0">
              <Checkbox label="Must have" {...register(`skillsRequired.${index}.isMandatory`)} />
            </div>
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove skill ${index + 1}`}
              className="mb-5 grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted hover:bg-elevated hover:text-ink"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <Button
        size="sm"
        variant="ghost"
        disabled={fields.length >= LIMITS.MAX_JOB_SKILLS}
        onClick={() => append({ name: '', isMandatory: false })}
      >
        + Add skill
      </Button>
    </div>
  );
};

/* ------------------------------------------------------------- transforms */

const toForm = (job) => ({
  title: job?.title ?? '',
  description: job?.description ?? '',
  employmentType: job?.employmentType ?? '',
  workMode: job?.workMode ?? '',
  // `<input type="date">` wants YYYY-MM-DD; an ISO timestamp renders as an empty control with
  // no error, which reads as "the deadline was lost".
  deadline: job?.deadline ? String(job.deadline).slice(0, 10) : '',
  openings: job?.openings ?? 1,
  industry: job?.industry ?? '',
  department: job?.department ?? '',

  location: {
    city: job?.location?.city ?? '',
    state: job?.location?.state ?? '',
    country: job?.location?.country ?? '',
    isRemoteAnywhere: job?.location?.isRemoteAnywhere ?? false,
  },

  salary: {
    min: job?.salary?.min ?? '',
    max: job?.salary?.max ?? '',
    currency: job?.salary?.currency ?? 'INR',
    period: job?.salary?.period ?? 'YEARLY',
    isDisclosed: job?.salary?.isDisclosed ?? true,
  },

  // Months in the API, years in the form — nobody advertises "36 months' experience".
  experienceMinYears: job?.experience?.minMonths != null ? job.experience.minMonths / 12 : '',
  experienceMaxYears: job?.experience?.maxMonths != null ? job.experience.maxMonths / 12 : '',
  education: { level: job?.education?.level ?? 'ANY' },

  skillsRequired: (job?.skillsRequired ?? []).map((s) => ({
    name: s.name,
    isMandatory: Boolean(s.isMandatory),
  })),

  // `useFieldArray` needs objects, not bare strings, or every keystroke remounts the input
  // and the field loses focus.
  responsibilities: toItems(job?.responsibilities),
  requirements: toItems(job?.requirements),
  niceToHave: toItems(job?.niceToHave),
  benefits: toItems(job?.benefits),
});

const toPayload = (values) => ({
  title: values.title.trim(),
  description: values.description.trim(),
  employmentType: values.employmentType,
  workMode: values.workMode,
  deadline: values.deadline ? new Date(`${values.deadline}T23:59:59.999Z`).toISOString() : undefined,
  openings: Number(values.openings) || 1,
  industry: values.industry || undefined,
  department: values.department?.trim() || undefined,

  location: {
    city: values.location.city?.trim() || undefined,
    state: values.location.state?.trim() || undefined,
    country: values.location.country?.trim() || undefined,
    isRemoteAnywhere: Boolean(values.location.isRemoteAnywhere),
  },

  salary: {
    min: numberOrNull(values.salary.min),
    max: numberOrNull(values.salary.max),
    currency: values.salary.currency,
    period: values.salary.period,
    isDisclosed: Boolean(values.salary.isDisclosed),
  },

  experience: {
    minMonths: values.experienceMinYears === '' ? null : Math.round(Number(values.experienceMinYears) * 12),
    maxMonths: values.experienceMaxYears === '' ? null : Math.round(Number(values.experienceMaxYears) * 12),
  },
  education: { level: values.education.level },

  skillsRequired: (values.skillsRequired ?? [])
    .filter((s) => s.name?.trim())
    .map((s) => ({ name: s.name.trim(), isMandatory: Boolean(s.isMandatory) })),

  responsibilities: fromItems(values.responsibilities),
  requirements: fromItems(values.requirements),
  niceToHave: fromItems(values.niceToHave),
  benefits: fromItems(values.benefits),
});

const toItems = (list) => (list ?? []).map((value) => ({ value }));
const fromItems = (items) => (items ?? []).map((i) => i.value?.trim()).filter(Boolean);
const numberOrNull = (value) => (value === '' || value == null ? null : Number(value));

/** DRAFT, REJECTED and ARCHIVED can all be pushed into review; PENDING and APPROVED cannot. */
const canSubmit = (status) =>
  [JOB_STATUS.DRAFT, JOB_STATUS.REJECTED, JOB_STATUS.ARCHIVED].includes(status);

const listFields = (fields) => {
  const labels = fields.map((f) => FIELD_LABELS[f] ?? f);
  if (labels.length === 1) return `the ${labels[0]}`;
  return `the ${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
};

const FIELD_LABELS = {
  title: 'title',
  description: 'description',
  responsibilities: 'responsibilities',
  requirements: 'requirements',
  skillsRequired: 'skills',
  salary: 'salary',
  employmentType: 'employment type',
  workMode: 'work mode',
  location: 'location',
  experience: 'experience range',
  openings: 'number of openings',
};

const applyFieldErrors = (error, setError) => {
  if (error.code === ERROR_CODES.VALIDATION_ERROR && Array.isArray(error.details)) {
    error.details.forEach(({ field, message }) => setError(field, { message }));
    return;
  }
  setError('root', { message: error.message });
};

/**
 * ★ The one refusal an employer will actually hit here.
 *
 * Posting is gated on company verification, so a brand-new employer's first "submit" can fail
 * for a reason that has nothing to do with the listing they just wrote. Pointing them at the
 * verification screen is the difference between a dead end and a next step.
 */
const mapSubmitError = (error) =>
  error?.code === ERROR_CODES.EMPLOYER_NOT_VERIFIED ? (
    <>
      Your company has not been verified yet, so listings cannot go live.{' '}
      <Link to={ROUTES.EMPLOYER_VERIFICATION} className="font-medium underline">
        Finish verification
      </Link>{' '}
      — your draft is saved and waiting.
    </>
  ) : (
    error?.message
  );

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const maxDeadline = () =>
  new Date(Date.now() + LIMITS.MAX_DEADLINE_DAYS_AHEAD * 86_400_000).toISOString().slice(0, 10);

export default JobForm;
