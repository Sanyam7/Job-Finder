import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  AVAILABILITY_META,
  AVAILABILITY_VALUES,
  CURRENCY_META,
  CURRENCY_VALUES,
  EMPLOYMENT_TYPE_META,
  EMPLOYMENT_TYPE_VALUES,
  ERROR_CODES,
  LIMITS,
  PARSE_STATUS,
  PROFILE_VISIBILITY,
  PROFILE_VISIBILITY_META,
  PROFILE_VISIBILITY_VALUES,
  WORK_MODE_META,
  WORK_MODE_VALUES,
  formatBytes,
} from '@verihire/shared';

import { candidateApi } from '../../api/services/index.js';
import { ROUTES } from '../../routes/paths.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input, Textarea, Select, Checkbox, Label } from '../../components/ui/Input.jsx';
import { PageHeader, Card, CardHeader } from '../../components/ui/Card.jsx';
import { Alert, ErrorState, Skeleton } from '../../components/ui/Feedback.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { ProvenanceChip } from '../../features/candidate/ProvenanceChip.jsx';
import { SkillsEditor } from '../../features/candidate/SkillsEditor.jsx';
import { CollectionEditor, COLLECTION_SCHEMA } from '../../features/candidate/CollectionEditor.jsx';
import { cn } from '../../utils/cn.js';

/**
 * The candidate profile editor.
 *
 * ★ This is the other half of ADR-006. The review screen decides what a parser is allowed to
 * write; this screen is where the candidate writes their own, and every save here marks the
 * touched paths `USER` — which is what makes them immune to a later re-parse. The provenance
 * chips make that visible rather than leaving it as an invisible server rule.
 *
 * ★ Each section saves independently against its own endpoint. One giant "save profile"
 * button would mean a validation error in a certification blocks a headline fix, and would
 * re-send forty fields to change one. The cost is that "unsaved changes" is per-section, so
 * each section tracks and shows its own dirty state.
 */
export const Profile = () => {
  const queryClient = useQueryClient();

  const { data: profile, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['candidate', 'me'],
    queryFn: candidateApi.me,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['candidate'] });

  if (isLoading) return <Skeleton className="h-96" />;
  if (isError) return <ErrorState message={error?.message} onRetry={refetch} />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Your profile"
        description="This is what an employer sees when you apply. Everything here is yours to edit."
      />

      <Completeness value={profile.profileCompleteness} />

      {/*
        ★ Only raised for fields autofill refused to touch.
        Everything the resume gave us that the candidate had not already written is in the
        form below, so this is not "come and approve your resume" — it is the narrower and
        genuinely useful "the resume disagrees with something you typed".
      */}
      {profile.hasPendingDraft && (
        <Alert
          tone="info"
          title="Your resume disagrees with a few things you wrote"
          className="mb-4"
          action={
            <Link to={ROUTES.CANDIDATE_RESUME_REVIEW}>
              <Button size="sm">Compare</Button>
            </Link>
          }
        >
          We kept what you typed. Compare them side by side and switch any you would rather
          take from the resume.
        </Alert>
      )}

      <div className="space-y-4">
        <ResumeCard resume={profile.resume} onChanged={invalidate} />

        <Section title="Basics" description="The first three lines an employer reads.">
          <BasicsForm profile={profile} onSaved={invalidate} />
        </Section>

        <Section
          title="Skills"
          description="How employers find you in search."
          badge={profile.skills?.length ? `${profile.skills.length}` : null}
        >
          <SkillsSection profile={profile} onSaved={invalidate} />
        </Section>

        {Object.keys(COLLECTION_SCHEMA).map((collection) => (
          <Section
            key={collection}
            title={COLLECTION_SCHEMA[collection].label}
            badge={profile[collection]?.length ? `${profile[collection].length}` : null}
          >
            <CollectionSection
              collection={collection}
              items={profile[collection] ?? []}
              onSaved={invalidate}
            />
          </Section>
        ))}

        <Section
          title="What you're looking for"
          description="Used to match you to roles. Employers see everything here except your current pay."
        >
          <PreferencesForm profile={profile} onSaved={invalidate} />
        </Section>

        <Section title="Who can find you" description="Off by default. Nothing is shared until you say so.">
          <VisibilityForm profile={profile} onSaved={invalidate} />
        </Section>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ layout */

/**
 * @param {{title: React.ReactNode, description?: React.ReactNode, badge?: string|null,
 *          children?: React.ReactNode}} props
 */
const Section = ({ title, description, badge, children }) => (
  <Card>
    <CardHeader
      title={
        <>
          {title}
          {badge && (
            <Badge tone="neutral" size="sm" className="ml-2">
              {badge}
            </Badge>
          )}
        </>
      }
      description={description}
    />
    <div className="mt-4">{children}</div>
  </Card>
);

/**
 * Completeness.
 *
 * ★ Names the single highest-value missing thing rather than showing a bare percentage. "62%"
 * is a scold; "add a headline" is a task. The weights live on the server so this stays a
 * display of the server's opinion, not a second one.
 */
const Completeness = ({ value = 0 }) => (
  <Card className="mb-4">
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Profile completeness</span>
          <span className="tabular-nums text-muted">{value}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-elevated">
          <div
            className={cn(
              'h-2 rounded-full transition-[width] duration-500',
              value >= 80 ? 'bg-accent-600' : value >= 50 ? 'bg-brand-500' : 'bg-warn-500',
            )}
            style={{ width: `${value}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {value >= 80
            ? 'Strong. Employers can see everything they need to shortlist you.'
            : 'Profiles with a headline, skills and one role get shortlisted far more often.'}
        </p>
      </div>
    </div>
  </Card>
);

/* ------------------------------------------------------------------ resume */

/**
 * Resume upload.
 *
 * ★ The upload does not replace anything on the profile. It attaches the file and queues a
 * parse whose output lands in `parsedDraft` for review. That is the whole ADR-006 contract and
 * the copy states it, because every other product on the market does the opposite and users
 * arrive expecting to be overwritten.
 */
const ResumeCard = ({ resume, onChanged }) => {
  const [fileError, setFileError] = useState(null);

  const upload = useMutation({
    mutationFn: candidateApi.uploadResume,
    onSuccess: onChanged,
    onError: (error) => setFileError(mapUploadError(error)),
  });

  const remove = useMutation({ mutationFn: candidateApi.removeResume, onSuccess: onChanged });

  const openResume = useMutation({
    mutationFn: candidateApi.resumeUrl,
    // The signed URL expires in minutes, so it is fetched on click and never held in state.
    onSuccess: (data) => window.open(data.url, '_blank', 'noopener,noreferrer'),
  });

  const pick = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Checked before the request so a 5 MB upload on a phone connection is not spent
    // discovering it was 6 MB.
    if (file.size > LIMITS.MAX_RESUME_BYTES) {
      setFileError(`That file is ${formatBytes(file.size)}. The limit is ${formatBytes(LIMITS.MAX_RESUME_BYTES)}.`);
      return;
    }
    setFileError(null);
    upload.mutate(file);
  };

  return (
    <Card>
      <CardHeader
        title="Resume"
        description="Sent with every application. We also read it to suggest profile fields — you approve each one."
      />

      <div className="mt-4">
        {resume?.hasResume ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-elevated p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{resume.originalName}</p>
              <p className="text-xs text-muted">
                {formatBytes(resume.sizeBytes)} · uploaded {formatDate(resume.uploadedAt)}
                {resume.version > 1 && ` · version ${resume.version}`}
              </p>
              <ParseState status={resume.parseStatus} error={resume.parseError} />
            </div>

            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="ghost" isLoading={openResume.isPending} onClick={() => openResume.mutate()}>
                View
              </Button>
              <label className="cursor-pointer">
                <span className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-elevated">
                  Replace
                </span>
                <input type="file" accept=".pdf,.doc,.docx" onChange={pick} className="sr-only" />
              </label>
              <Button size="sm" variant="ghost" isLoading={remove.isPending} onClick={() => remove.mutate()}>
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center hover:border-brand-500">
            <span className="text-sm font-medium">Upload your resume</span>
            <span className="text-xs text-muted">PDF, DOC or DOCX · up to {formatBytes(LIMITS.MAX_RESUME_BYTES)}</span>
            <input type="file" accept=".pdf,.doc,.docx" onChange={pick} className="sr-only" />
            {upload.isPending && <span className="text-xs text-brand-500">Uploading…</span>}
          </label>
        )}

        {fileError && (
          <Alert tone="danger" className="mt-3">
            {fileError}
          </Alert>
        )}
      </div>
    </Card>
  );
};

const ParseState = ({ status, error }) => {
  if (status === PARSE_STATUS.PARSING) {
    return <p className="mt-1 text-xs text-brand-500">Reading it now — your profile is untouched.</p>;
  }
  if (status === PARSE_STATUS.FAILED) {
    return (
      <p className="mt-1 text-xs text-warn-600">
        We couldn&apos;t read this one{error ? `: ${error}` : ''}. It still goes out with your
        applications — only the suggestions failed.
      </p>
    );
  }
  return null;
};

/* ------------------------------------------------------------------ basics */

const BasicsForm = ({ profile, onSaved }) => {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm({ defaultValues: toBasics(profile) });

  const save = useMutation({
    mutationFn: candidateApi.update,
    onSuccess: (data) => {
      onSaved();
      // Reset from the server's response, not the submitted values: the API trims and
      // normalises, and a form left holding the pre-trim text reports itself dirty forever.
      reset(toBasics({ ...profile, ...data }));
    },
    onError: (error) => applyFieldErrors(error, setError),
  });

  const source = (path) => profile.fieldSources?.[path];
  const bio = watch('bio') ?? '';

  return (
    <form onSubmit={handleSubmit((values) => save.mutate(toBasicsPayload(values)))} noValidate>
      <FieldWithSource label="Headline" source={source('headline')}>
        <Input
          maxLength={LIMITS.MAX_HEADLINE_LENGTH}
          placeholder="Senior backend engineer · distributed systems"
          hint="One line. It appears under your name everywhere."
          error={errors.headline?.message}
          {...register('headline')}
        />
      </FieldWithSource>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <FieldWithSource label="Current company" source={source('currentCompany')}>
          <Input error={errors.currentCompany?.message} {...register('currentCompany')} />
        </FieldWithSource>
        <FieldWithSource label="Current role" source={source('currentDesignation')}>
          <Input error={errors.currentDesignation?.message} {...register('currentDesignation')} />
        </FieldWithSource>
      </div>

      <FieldWithSource label="About you" source={source('bio')}>
        <Textarea
          maxLength={LIMITS.MAX_BIO_LENGTH}
          value={bio}
          hint="What you build, what you are good at, what you want next."
          error={errors.bio?.message}
          {...register('bio')}
        />
      </FieldWithSource>

      {/*
        Years, not months. The API stores months because that is what a resume parser can
        derive from date ranges; nobody describes their career in months.
      */}
      <FieldWithSource label="Total experience" source={source('totalExperienceMonths')}>
        <Input
          type="number"
          min={0}
          max={60}
          step={0.5}
          inputMode="decimal"
          rightAddon={<span className="pr-2 text-xs text-muted">years</span>}
          error={errors.experienceYears?.message}
          {...register('experienceYears')}
        />
      </FieldWithSource>

      <div className="grid gap-x-4 sm:grid-cols-3">
        <Input label="City" error={errors['location.city']?.message} {...register('location.city')} />
        <Input label="State" {...register('location.state')} />
        <Input label="Country" {...register('location.country')} />
      </div>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Input
          label="LinkedIn"
          type="url"
          placeholder="https://linkedin.com/in/you"
          error={errors['links.linkedin']?.message}
          {...register('links.linkedin')}
        />
        <Input
          label="GitHub"
          type="url"
          placeholder="https://github.com/you"
          error={errors['links.github']?.message}
          {...register('links.github')}
        />
        <Input
          label="Portfolio"
          type="url"
          placeholder="https://"
          error={errors['links.portfolio']?.message}
          {...register('links.portfolio')}
        />
        <Input label="Other" type="url" placeholder="https://" {...register('links.twitter')} />
      </div>

      <SaveBar isDirty={isDirty} mutation={save} rootError={errors.root?.message} />
    </form>
  );
};

/**
 * A label + provenance chip above an existing field.
 *
 * The design-system `Input` renders its own label, so this passes the label through as a
 * sibling rather than duplicating it — two labels for one control is worse for a screen
 * reader than none.
 */
const FieldWithSource = ({ label, source, children }) => (
  <div>
    <div className="mb-1.5 flex items-center gap-2">
      <Label className="mb-0">{label}</Label>
      <ProvenanceChip source={source} />
    </div>
    {children}
  </div>
);

/* ------------------------------------------------------------------ skills */

const SkillsSection = ({ profile, onSaved }) => {
  const save = useMutation({ mutationFn: candidateApi.setSkills, onSuccess: onSaved });

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <ProvenanceChip source={profile.fieldSources?.skills} />
      </div>
      <SkillsEditor
        // Remount when the saved list changes so the editor's local copy cannot drift from
        // the server's after a save or a draft apply.
        key={profile.updatedAt}
        value={profile.skills ?? []}
        isSaving={save.isPending}
        error={save.error?.message}
        onSave={(skills) => save.mutate(skills)}
      />
    </>
  );
};

/* ------------------------------------------------------------- collections */

const CollectionSection = ({ collection, items, onSaved }) => {
  const [pendingId, setPendingId] = useState(null);

  const done = () => {
    setPendingId(null);
    onSaved();
  };

  const add = useMutation({
    mutationFn: (item) => candidateApi.addItem(collection, item),
    onMutate: () => setPendingId('new'),
    onSettled: done,
  });

  const update = useMutation({
    // Annotated on the parameter so TanStack Query infers the variables type.
    mutationFn: (/** @type {{id: string, patch: Record<string, any>}} */ vars) =>
      candidateApi.updateItem(collection, vars.id, vars.patch),
    onMutate: (vars) => setPendingId(vars.id),
    onSettled: done,
  });

  const remove = useMutation({
    mutationFn: (id) => candidateApi.removeItem(collection, id),
    onMutate: (id) => setPendingId(id),
    onSettled: done,
  });

  return (
    <CollectionEditor
      collection={collection}
      items={items}
      pendingId={pendingId}
      error={add.error?.message ?? update.error?.message ?? remove.error?.message}
      onAdd={(item) => add.mutate(item)}
      onUpdate={(id, patch) => update.mutate({ id, patch })}
      onRemove={(id) => remove.mutate(id)}
    />
  );
};

/* ------------------------------------------------------------- preferences */

const PreferencesForm = ({ profile, onSaved }) => {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm({ defaultValues: toPreferences(profile.preferences ?? {}) });

  const save = useMutation({
    mutationFn: candidateApi.updatePreferences,
    onSuccess: (data) => {
      onSaved();
      reset(toPreferences(data?.preferences ?? {}));
    },
    onError: (error) => applyFieldErrors(error, setError),
  });

  return (
    <form onSubmit={handleSubmit((values) => save.mutate(toPreferencesPayload(values)))} noValidate>
      <CheckboxGroup
        legend="Employment types"
        options={EMPLOYMENT_TYPE_VALUES.map((v) => ({ value: v, label: EMPLOYMENT_TYPE_META[v].label }))}
        register={register}
        name="jobTypes"
      />

      <CheckboxGroup
        legend="Work modes"
        options={WORK_MODE_VALUES.map((v) => ({ value: v, label: WORK_MODE_META[v].label }))}
        register={register}
        name="workModes"
      />

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Select
          label="When you could start"
          options={AVAILABILITY_VALUES.map((v) => ({ value: v, label: AVAILABILITY_META[v].label }))}
          placeholder="Not specified"
          {...register('availability')}
        />
        <Input
          label="Notice period"
          type="number"
          min={0}
          max={LIMITS.MAX_NOTICE_PERIOD_DAYS}
          rightAddon={<span className="pr-2 text-xs text-muted">days</span>}
          error={errors.noticePeriodDays?.message}
          {...register('noticePeriodDays')}
        />
      </div>

      <fieldset className="mb-4">
        <legend className="mb-1.5 text-sm font-medium text-ink">Expected salary</legend>
        <div className="grid gap-x-4 sm:grid-cols-4">
          <Input type="number" min={0} placeholder="Minimum" aria-label="Minimum expected salary" {...register('expectedSalary.min')} />
          <Input type="number" min={0} placeholder="Maximum" aria-label="Maximum expected salary" {...register('expectedSalary.max')} />
          <Select
            aria-label="Currency"
            options={CURRENCY_VALUES.map((v) => ({ value: v, label: `${CURRENCY_META[v].symbol} ${v}` }))}
            {...register('expectedSalary.currency')}
          />
          <Select
            aria-label="Period"
            options={[
              { value: 'YEARLY', label: 'per year' },
              { value: 'MONTHLY', label: 'per month' },
              { value: 'HOURLY', label: 'per hour' },
            ]}
            {...register('expectedSalary.period')}
          />
        </div>
        {errors['expectedSalary.max'] && (
          <p role="alert" className="text-xs text-danger-500">
            {errors['expectedSalary.max'].message}
          </p>
        )}
      </fieldset>

      <Input
        label="Preferred locations"
        placeholder="Bengaluru, Remote, Berlin"
        hint="Comma separated. Up to 10."
        {...register('preferredLocations')}
      />

      <div className="mb-4">
        <Checkbox label="I'm open to relocating" {...register('willingToRelocate')} />
      </div>

      {/*
        ★ Current pay is stored but is stripped from every employer-facing projection — see
        the note at the top of candidate.response.dto.js. Saying so here is the difference
        between a field people fill in honestly and one they inflate or skip.
      */}
      <fieldset className="mb-2 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium text-ink">Current salary</legend>
        <p className="mb-2 text-xs text-muted">
          Never shown to employers — not in search, not on your application. It is used only to
          match you to roles that pay more.
        </p>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Input type="number" min={0} aria-label="Current salary amount" {...register('currentSalary.amount')} />
          <Select
            aria-label="Currency"
            options={CURRENCY_VALUES.map((v) => ({ value: v, label: `${CURRENCY_META[v].symbol} ${v}` }))}
            {...register('currentSalary.currency')}
          />
        </div>
      </fieldset>

      <SaveBar isDirty={isDirty} mutation={save} rootError={errors.root?.message} />
    </form>
  );
};

const CheckboxGroup = ({ legend, options, register, name }) => (
  <fieldset className="mb-4">
    <legend className="mb-1.5 text-sm font-medium text-ink">{legend}</legend>
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {options.map((option) => (
        <Checkbox key={option.value} label={option.label} value={option.value} {...register(name)} />
      ))}
    </div>
  </fieldset>
);

/* -------------------------------------------------------------- visibility */

/**
 * ★ The candidate's side of the platform's symmetry.
 *
 * Employers are invisible until an admin approves them; candidates are invisible until they
 * opt in. Neither is on by default, and this form does not nudge — the descriptions state
 * what each setting does and stop there.
 */
const VisibilityForm = ({ profile, onSaved }) => {
  const [openToWork, setOpenToWork] = useState(profile.openToWork ?? false);
  const [visibility, setVisibility] = useState(profile.profileVisibility ?? PROFILE_VISIBILITY.PRIVATE);

  const save = useMutation({
    mutationFn: candidateApi.updateVisibility,
    onSuccess: onSaved,
  });

  const isDirty =
    openToWork !== (profile.openToWork ?? false) ||
    visibility !== (profile.profileVisibility ?? PROFILE_VISIBILITY.PRIVATE);

  return (
    <div>
      <div className="mb-4">
        <Checkbox
          label="I'm open to work"
          description="Shows an open-to-work marker to verified employers who find your profile."
          checked={openToWork}
          onChange={(event) => setOpenToWork(event.target.checked)}
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Profile visibility</legend>
        <div className="space-y-2" role="radiogroup" aria-label="Profile visibility">
          {PROFILE_VISIBILITY_VALUES.map((value) => {
            const meta = PROFILE_VISIBILITY_META[value];
            const selected = visibility === value;

            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setVisibility(value)}
                className={cn(
                  'w-full rounded-md border p-3 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-border hover:border-muted/50',
                )}
              >
                <span className="text-sm font-medium text-ink">{meta.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{meta.description}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/*
        Applying is always possible regardless of this setting — otherwise someone who wants
        to job-hunt privately would conclude the platform is closed to them.
      */}
      <p className="mt-3 text-xs text-muted">
        Whatever you choose here, an employer always sees your full profile when you apply to
        their job. This controls search only.
      </p>

      <div className="mt-4 flex justify-end">
        <Button
          disabled={!isDirty}
          isLoading={save.isPending}
          onClick={() => save.mutate({ openToWork, profileVisibility: visibility })}
        >
          Save
        </Button>
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------- shared */

/**
 * Per-section save bar.
 *
 * ★ Disabled until something changes. An always-enabled save button trains people to press it
 * on every visit, and each press is a write, an audit entry and a `USER` provenance mark on
 * fields they never touched — which would quietly lock parser-owned fields against future
 * improvement.
 */
const SaveBar = ({ isDirty, mutation, rootError }) => (
  <div className="mt-2 flex items-center justify-end gap-3">
    {mutation.isSuccess && !isDirty && <span className="text-xs text-accent-600">Saved</span>}
    {(mutation.isError || rootError) && (
      <span role="alert" className="mr-auto text-xs text-danger-500">
        {rootError ?? mutation.error?.message}
      </span>
    )}
    <Button type="submit" disabled={!isDirty} isLoading={mutation.isPending}>
      Save changes
    </Button>
  </div>
);

/* ------------------------------------------------------------- transforms */

const toBasics = (profile) => ({
  headline: profile.headline ?? '',
  bio: profile.bio ?? '',
  currentCompany: profile.currentCompany ?? '',
  currentDesignation: profile.currentDesignation ?? '',
  // Months are the storage unit; years are the human unit. One decimal place, because
  // "2.5 years" is meaningful and "2.53" is not.
  experienceYears: profile.totalExperienceMonths ? round1(profile.totalExperienceMonths / 12) : '',
  location: {
    city: profile.location?.city ?? '',
    state: profile.location?.state ?? '',
    country: profile.location?.country ?? '',
  },
  links: {
    linkedin: profile.links?.linkedin ?? '',
    github: profile.links?.github ?? '',
    portfolio: profile.links?.portfolio ?? '',
    twitter: profile.links?.twitter ?? '',
  },
});

const toBasicsPayload = (values) => ({
  headline: blankToNull(values.headline),
  bio: blankToNull(values.bio),
  currentCompany: blankToNull(values.currentCompany),
  currentDesignation: blankToNull(values.currentDesignation),
  totalExperienceMonths: values.experienceYears === '' ? null : Math.round(Number(values.experienceYears) * 12),
  location: mapValues(values.location, blankToNull),
  links: mapValues(values.links, blankToNull),
});

const toPreferences = (prefs) => ({
  jobTypes: prefs.jobTypes ?? [],
  workModes: prefs.workModes ?? [],
  preferredLocations: (prefs.preferredLocations ?? []).join(', '),
  availability: prefs.availability ?? '',
  noticePeriodDays: prefs.noticePeriodDays ?? '',
  willingToRelocate: prefs.willingToRelocate ?? false,
  expectedSalary: {
    min: prefs.expectedSalary?.min ?? '',
    max: prefs.expectedSalary?.max ?? '',
    currency: prefs.expectedSalary?.currency ?? 'INR',
    period: prefs.expectedSalary?.period ?? 'YEARLY',
  },
  currentSalary: {
    amount: prefs.currentSalary?.amount ?? '',
    currency: prefs.currentSalary?.currency ?? 'INR',
  },
});

const toPreferencesPayload = (values) => ({
  // `register` on a checkbox group yields a string when one box is ticked and an array when
  // several are — normalising here stops a single selection reaching the API as "FULL_TIME"
  // where an array is expected.
  jobTypes: asArray(values.jobTypes),
  workModes: asArray(values.workModes),
  preferredLocations: String(values.preferredLocations ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10),
  availability: values.availability || undefined,
  noticePeriodDays: values.noticePeriodDays === '' ? null : Number(values.noticePeriodDays),
  willingToRelocate: Boolean(values.willingToRelocate),
  expectedSalary: {
    min: numberOrNull(values.expectedSalary?.min),
    max: numberOrNull(values.expectedSalary?.max),
    currency: values.expectedSalary?.currency,
    period: values.expectedSalary?.period,
  },
  currentSalary: {
    amount: numberOrNull(values.currentSalary?.amount),
    currency: values.currentSalary?.currency,
  },
});

const applyFieldErrors = (error, setError) => {
  if (error.code === ERROR_CODES.VALIDATION_ERROR && Array.isArray(error.details)) {
    error.details.forEach(({ field, message }) => setError(field, { message }));
    return;
  }
  setError('root', { message: error.message });
};

const mapUploadError = (error) =>
  ({
    [ERROR_CODES.FILE_TOO_LARGE]: `That file is over the ${formatBytes(LIMITS.MAX_RESUME_BYTES)} limit.`,
    [ERROR_CODES.UNSUPPORTED_FILE_TYPE]: 'Resumes must be a PDF, DOC or DOCX.',
    [ERROR_CODES.CORRUPTED_FILE]:
      "That file's contents don't match its extension — try exporting it again.",
  })[error.code] ?? error.message;

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const blankToNull = (value) => (String(value ?? '').trim() === '' ? null : String(value).trim());
const numberOrNull = (value) => (value === '' || value == null ? null : Number(value));
const round1 = (value) => Math.round(value * 10) / 10;
const mapValues = (object, fn) => Object.fromEntries(Object.entries(object ?? {}).map(([k, v]) => [k, fn(v)]));

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';

export default Profile;
