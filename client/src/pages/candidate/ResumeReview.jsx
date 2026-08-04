import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PARSE_STATUS } from '@verihire/shared';
import { candidateApi } from '../../api/services/index.js';
import { Button } from '../../components/ui/Button.jsx';
import { Checkbox } from '../../components/ui/Input.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Alert, EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback.jsx';
import { PageHeader, Card } from '../../components/ui/Card.jsx';
import { cn } from '../../utils/cn.js';

/**
 * ★★ ADR-006 made visible — "never force AI extracted values".
 *
 * This screen is the whole reason `parsedDraft` is a separate storage location rather than a
 * write path into the profile. Three rules govern it, and each is a deliberate refusal of the
 * pattern every other resume importer uses:
 *
 *  1. **Nothing is pre-selected.** A pre-ticked checkbox is not consent — it is a default the
 *     user has to notice and undo, and most people don't.
 *  2. **Conflicts are called out, not resolved.** Where extraction disagrees with something
 *     the candidate wrote, both values are shown side by side and the row is flagged.
 *  3. **Discarding is a first-class action**, as prominent as applying. The profile is
 *     untouched either way; that is the point.
 */
export const ResumeReview = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  /** @type {[Set<string>, Function]} — deliberately starts empty. See rule 1. */
  const [selected, setSelected] = useState(new Set());

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['candidate', 'resume', 'draft'],
    queryFn: candidateApi.getDraft,
    // While the worker is still reading the file, poll — otherwise the candidate sits on a
    // "we're reading it" message that never resolves without a manual refresh.
    refetchInterval: (query) =>
      query.state.data?.parseStatus === PARSE_STATUS.PARSING ? 3000 : false,
  });

  const applyDraft = useMutation({
    mutationFn: () => candidateApi.applyDraft([...selected]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate'] });
      navigate('/candidate/profile');
    },
  });

  const discard = useMutation({
    mutationFn: candidateApi.discardDraft,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate'] });
      navigate('/candidate/profile');
    },
  });

  const toggle = (path) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  if (isLoading) return <Skeleton className="h-64" />;
  if (isError) return <ErrorState message={error?.message} onRetry={refetch} />;

  if (data.parseStatus === PARSE_STATUS.PARSING) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Reading your resume" />
        <Card className="text-center">
          <p className="text-sm text-muted">
            This usually takes a few seconds. Your profile is untouched while we read — nothing
            is changed without you choosing it.
          </p>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </Card>
      </div>
    );
  }

  if (data.parseStatus === PARSE_STATUS.FAILED) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="We couldn't read that resume" />
        <Alert tone="warning" className="mb-4">
          {data.parseError ?? "We couldn't extract any details from that file."}
        </Alert>
        <p className="mb-4 text-sm text-muted">
          Your resume is still attached and still goes out with your applications — only the
          automatic fill-in failed. You can complete your profile by hand.
        </p>
        <Link to="/candidate/profile">
          <Button>Edit profile manually</Button>
        </Link>
      </div>
    );
  }

  if (!data.hasDraft) {
    return (
      <EmptyState
        title="Nothing to review"
        description="Upload a resume and we'll read it, then show you what we found before anything is saved."
        action={{ label: 'Go to profile', onClick: () => navigate('/candidate/profile') }}
      />
    );
  }

  const conflicts = data.fields.filter((f) => f.conflictsWithUserEdit);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Review what we found"
        description="We read your resume. Nothing below has been saved — choose what you want to keep."
      />

      {/*
        ★ The guarantee, stated plainly at the top.
        Users have been trained by other products to expect an import to overwrite their work,
        so the reassurance has to be explicit or they will not trust the screen.
      */}
      <Alert tone="info" className="mb-4">
        Your profile has not changed. Only the rows you tick are applied, and you can edit
        anything afterwards.
      </Alert>

      {conflicts.length > 0 && (
        <Alert tone="warning" title="Some of these replace things you wrote" className="mb-4">
          {conflicts.length} row{conflicts.length === 1 ? '' : 's'} would overwrite a value you
          entered yourself. Those are marked below.
        </Alert>
      )}

      <div className="space-y-3">
        {data.fields.map((field) => (
          <FieldRow
            key={field.path}
            field={field}
            isSelected={selected.has(field.path)}
            onToggle={() => toggle(field.path)}
          />
        ))}
      </div>

      {applyDraft.isError && (
        <Alert tone="danger" className="mt-4">
          {applyDraft.error?.message}
        </Alert>
      )}

      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-bg/95 py-4 backdrop-blur">
        <p className="text-sm text-muted">
          {selected.size === 0
            ? 'Nothing selected'
            : `${selected.size} of ${data.fields.length} selected`}
        </p>

        <div className="flex gap-2">
          {/*
            Discard is a real, equally-weighted action. Hiding it behind a "×" would make
            keeping the machine's version the path of least resistance.
          */}
          <Button
            variant="ghost"
            isLoading={discard.isPending}
            onClick={() => discard.mutate()}
          >
            Discard all
          </Button>
          <Button
            // The server refuses an empty list too; disabling here just avoids a pointless 422.
            disabled={selected.size === 0}
            isLoading={applyDraft.isPending}
            onClick={() => applyDraft.mutate()}
          >
            Apply {selected.size > 0 && `${selected.size} `}selected
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * One extracted field, side by side with what the profile currently holds.
 *
 * The two columns are the honesty mechanism: a single "we found X" row hides the fact that
 * accepting it destroys something. Showing both makes the trade explicit.
 */
const FieldRow = ({ field, isSelected, onToggle }) => (
  <Card
    className={cn(
      'transition-colors',
      isSelected && 'border-brand-500 bg-brand-50/40 dark:bg-brand-900/20',
      field.conflictsWithUserEdit && !isSelected && 'border-warn-500/50',
    )}
  >
    <div className="flex gap-3">
      <Checkbox
        checked={isSelected}
        onChange={onToggle}
        label=""
        aria-label={`Apply ${humanisePath(field.path)}`}
      />

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">{humanisePath(field.path)}</h3>
          {field.conflictsWithUserEdit && (
            <Badge tone="warning" size="sm">
              You wrote this — applying replaces it
            </Badge>
          )}
          {field.isEmpty && (
            <Badge tone="success" size="sm">
              Currently empty
            </Badge>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ValueBlock label="Your profile now" value={field.current} muted />
          <ValueBlock label="From your resume" value={field.extracted} />
        </div>
      </div>
    </div>
  </Card>
);

/**
 * Renders a value of unknown shape.
 *
 * Extracted values are strings, numbers, arrays of objects, or nested objects depending on
 * the field, and a raw `JSON.stringify` dump would make the review screen unreadable — which
 * would push people to accept everything without looking, defeating the whole design.
 */
/** @param {{label: string, value: any, muted?: boolean}} props */
const ValueBlock = ({ label, value, muted }) => (
  <div>
    <p className="mb-1 text-xs text-muted">{label}</p>
    <div
      className={cn(
        'rounded-md border border-border p-2 text-sm',
        muted ? 'bg-elevated text-muted' : 'bg-surface text-ink',
      )}
    >
      {renderValue(value)}
    </div>
  </div>
);

const renderValue = (value) => {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) {
    return <span className="italic opacity-60">Empty</span>;
  }

  if (Array.isArray(value)) {
    return (
      <ul className="space-y-1">
        {value.slice(0, 4).map((item, index) => (
          <li key={index} className="truncate">
            • {summariseItem(item)}
          </li>
        ))}
        {value.length > 4 && <li className="text-xs opacity-70">+{value.length - 4} more</li>}
      </ul>
    );
  }

  if (typeof value === 'object') {
    return (
      <ul className="space-y-0.5">
        {Object.entries(value).map(([key, val]) => (
          <li key={key} className="truncate text-xs">
            <span className="opacity-70">{key}:</span> {String(val)}
          </li>
        ))}
      </ul>
    );
  }

  return <span className="line-clamp-3">{String(value)}</span>;
};

/** Picks the one field a human would use to recognise the entry. */
const summariseItem = (item) => {
  if (typeof item !== 'object' || item === null) return String(item);
  if (item.title && item.company) return `${item.title} · ${item.company}`;
  return item.name ?? item.degree ?? item.title ?? JSON.stringify(item).slice(0, 60);
};

/** `totalExperienceMonths` → `Total experience`. */
const humanisePath = (path) => {
  const LABELS = {
    headline: 'Headline',
    bio: 'About you',
    skills: 'Skills',
    experience: 'Work experience',
    education: 'Education',
    links: 'Links',
    totalExperienceMonths: 'Total experience',
    currentCompany: 'Current company',
    currentDesignation: 'Current role',
  };

  return (
    LABELS[path] ??
    path
      .split('.')
      .pop()
      .replace(/([A-Z])/g, ' $1')
      .replace(/^\w/, (c) => c.toUpperCase())
  );
};

export default ResumeReview;
