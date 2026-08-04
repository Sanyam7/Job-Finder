import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppSelector } from '../../app/hooks.js';
import { BOOKMARK_ENTITY, ROLES, WORK_MODE_VALUES, EMPLOYMENT_TYPE_VALUES } from '@verihire/shared';
import { publicApi, bookmarkApi } from '../../api/services/index.js';
import { JobCard } from '../../features/jobs/components/JobCard.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input, Select } from '../../components/ui/Input.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import {
  EmptyState,
  ErrorState,
  JobCardSkeleton,
  LiveStatus,
} from '../../components/ui/Feedback.jsx';
import { PageHeader } from '../../components/ui/Card.jsx';

/**
 * Public job browse.
 *
 * ★ Filter state lives in the URL, not in React state. A candidate who finds a promising
 * search must be able to bookmark it, share it, or hit back without losing it — and a
 * server-rendered crawler sees the same page the user does. This is also why the query key
 * is derived from `searchParams`: the cache and the address bar cannot disagree.
 *
 * Every result here came through `buildPublicJobFilter()` on the server. The client does no
 * filtering of its own, so there is no second, subtly different definition of "visible".
 */
export const Jobs = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAppSelector((state) => state.auth.user);

  const params = useMemo(() => Object.fromEntries(searchParams), [searchParams]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['public', 'jobs', params],
    queryFn: () => publicApi.searchJobs(params),
    // The previous page stays on screen while the next loads, so paging does not flash a
    // full skeleton over content the user was already reading.
    placeholderData: (previous) => previous,
  });

  const toggleSave = useMutation({
    mutationFn: (/** @type {string} */ jobId) =>
      bookmarkApi.toggle({ entityType: BOOKMARK_ENTITY.JOB, entityId: jobId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookmarks'] }),
  });

  /** @param {Record<string, string|undefined>} patch */
  const updateFilters = (patch) => {
    const next = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Any filter change invalidates the current page — staying on page 4 of a new result
    // set usually lands the user on an empty page.
    if (!('page' in patch)) next.delete('page');

    setSearchParams(next, { replace: true });
  };

  const jobs = data?.items ?? [];
  const pagination = data?.pagination;
  const activeFilters = [...searchParams.keys()].filter((k) => k !== 'page');

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title="Verified jobs"
        description="Every listing here is from a company our team checked, and every posting was reviewed before it went live."
      />

      <form
        className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          updateFilters({ q: new FormData(event.currentTarget).get('q')?.toString() });
        }}
      >
        <Input
          name="q"
          defaultValue={params.q ?? ''}
          placeholder="Job title, skill or company"
          aria-label="Search jobs"
        />
        <Input
          name="location"
          defaultValue={params.location ?? ''}
          placeholder="City or remote"
          aria-label="Location"
          onBlur={(event) => updateFilters({ location: event.target.value })}
        />
        <Select
          aria-label="Work mode"
          value={params.workMode ?? ''}
          placeholder="Any work mode"
          onChange={(event) => updateFilters({ workMode: event.target.value })}
          options={WORK_MODE_VALUES.map((value) => ({ value, label: humanise(value) }))}
        />
        <Select
          aria-label="Employment type"
          value={params.employmentType ?? ''}
          placeholder="Any employment type"
          onChange={(event) => updateFilters({ employmentType: event.target.value })}
          options={EMPLOYMENT_TYPE_VALUES.map((value) => ({ value, label: humanise(value) }))}
        />
      </form>

      {activeFilters.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {activeFilters.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => updateFilters({ [key]: undefined })}
              aria-label={`Remove filter ${key}`}
            >
              <Badge tone="info">
                {humanise(key)}: {searchParams.get(key)} ✕
              </Badge>
            </button>
          ))}
          <Button variant="link" size="sm" onClick={() => setSearchParams({}, { replace: true })}>
            Clear all
          </Button>
        </div>
      )}

      {/* Announced to screen readers without stealing focus. */}
      <LiveStatus>
        {isLoading ? 'Searching' : `${pagination?.totalItems ?? 0} jobs found`}
      </LiveStatus>

      {!isLoading && !isError && (
        <p className="mb-4 text-sm text-muted">
          {pagination?.totalItems ?? 0} job{pagination?.totalItems === 1 ? '' : 's'}
        </p>
      )}

      {isError && (
        <ErrorState
          message={error?.message}
          requestId={error?.requestId}
          onRetry={refetch}
        />
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <JobCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!isLoading && !isError && jobs.length === 0 && (
        <EmptyState
          title="No jobs match those filters"
          description="Verified listings are added every day. Try widening your search, or clear the filters to see everything currently live."
          action={{ label: 'Clear filters', onClick: () => setSearchParams({}, { replace: true }) }}
        />
      )}

      <div className="space-y-3">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            onToggleSave={
              // Saving is a candidate action; showing the control to a guest or an employer
              // would offer something the API will refuse.
              user?.role === ROLES.CANDIDATE ? (id) => toggleSave.mutate(id) : undefined
            }
          />
        ))}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
          <Button
            variant="secondary"
            size="sm"
            disabled={!pagination.hasPrevPage}
            onClick={() => updateFilters({ page: String(pagination.page - 1) })}
          >
            Previous
          </Button>
          <span className="px-3 text-sm text-muted">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!pagination.hasNextPage}
            onClick={() => updateFilters({ page: String(pagination.page + 1) })}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
};

/** `FULL_TIME` → `Full time`. */
const humanise = (value) =>
  String(value ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());

export default Jobs;
