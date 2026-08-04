import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { JOB_STATUS, JOB_STATUS_META, JOB_STATUS_VALUES } from '@verihire/shared';

import { employerApi, jobApi } from '../../api/services/index.js';
import { ROUTES, buildPath } from '../../routes/paths.js';
import { Button } from '../../components/ui/Button.jsx';
import { Select } from '../../components/ui/Input.jsx';
import { PageHeader, Card, TableWrap, Th, Td } from '../../components/ui/Card.jsx';
import { JobStatusBadge } from '../../components/ui/Badge.jsx';
import { Alert, EmptyState, ErrorState, TableSkeleton } from '../../components/ui/Feedback.jsx';

/**
 * The employer's listings.
 *
 * ★ The column that matters is not "status" but **"is this visible to candidates right now"**.
 * They are not the same thing and employers conflate them constantly: an APPROVED job whose
 * deadline has passed, or one belonging to a company that was later suspended, is approved and
 * invisible. `isPubliclyVisible` is the server's own denormalised flag, so this table reports
 * the truth rather than inferring it from the status badge.
 */
export const EmployerJobs = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const status = searchParams.get('status') ?? '';

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['employer', 'jobs', status],
    queryFn: () => employerApi.myJobs({ status: status || undefined, limit: 50 }),
  });

  const archive = useMutation({
    mutationFn: jobApi.archive,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employer', 'jobs'] }),
  });

  const clone = useMutation({
    mutationFn: jobApi.clone,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employer', 'jobs'] }),
  });

  if (isError) return <ErrorState message={error?.message} onRetry={refetch} />;

  const jobs = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Your jobs"
        description="Every listing goes through review before candidates can see it."
        actions={
          <Link to={ROUTES.EMPLOYER_JOB_NEW}>
            <Button>Post a job</Button>
          </Link>
        }
      />

      <div className="mb-4 max-w-xs">
        <Select
          aria-label="Filter by status"
          value={status}
          placeholder="All statuses"
          onChange={(event) => {
            const next = event.target.value;
            setSearchParams(next ? { status: next } : {}, { replace: true });
          }}
          options={JOB_STATUS_VALUES.map((v) => ({ value: v, label: JOB_STATUS_META[v].label }))}
        />
      </div>

      {(archive.isError || clone.isError) && (
        <Alert tone="danger" className="mb-4">
          {archive.error?.message ?? clone.error?.message}
        </Alert>
      )}

      {isLoading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : jobs.length === 0 ? (
        <EmptyState
          title={status ? `No ${JOB_STATUS_META[status].label.toLowerCase()} listings` : 'No listings yet'}
          description={
            status
              ? 'Try a different status filter.'
              : 'Write your first listing. It saves as a draft — nothing is published until you submit it and an admin approves it.'
          }
          action={
            status
              ? { label: 'Show all', onClick: () => setSearchParams({}, { replace: true }) }
              : undefined
          }
        />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead className="border-b border-border bg-elevated">
              <tr>
                <Th>Listing</Th>
                <Th>Status</Th>
                <Th>Visible now</Th>
                <Th className="text-right">Applicants</Th>
                <Th>Deadline</Th>
                <Th><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <Td>
                    <Link
                      to={buildPath(ROUTES.EMPLOYER_JOB_EDIT, { id: job.id })}
                      className="font-medium hover:underline"
                    >
                      {job.title}
                    </Link>
                    <p className="text-xs text-muted">
                      {[job.employmentType, job.locationLabel].filter(Boolean).join(' · ')}
                    </p>
                  </Td>

                  <Td>
                    <JobStatusBadge status={job.status} />
                    {job.moderation?.revisionCount > 0 && (
                      <p className="mt-1 text-xs text-muted">
                        Revised {job.moderation.revisionCount}×
                      </p>
                    )}
                  </Td>

                  {/*
                    ★ Not derived from the status. See the note at the top of this file.
                  */}
                  <Td>
                    <VisibilityCell job={job} />
                  </Td>

                  <Td className="text-right tabular-nums">
                    {job.stats?.applicationCount > 0 ? (
                      <Link
                        to={buildPath(ROUTES.EMPLOYER_JOB_APPLICANTS, { id: job.id })}
                        className="font-medium text-brand-500 hover:underline"
                      >
                        {job.stats.applicationCount}
                      </Link>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </Td>

                  <Td className="whitespace-nowrap text-muted">{formatDate(job.deadline)}</Td>

                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => clone.mutate(job.id)}>
                        Duplicate
                      </Button>
                      {job.status !== JOB_STATUS.ARCHIVED && (
                        <Button size="sm" variant="ghost" onClick={() => archive.mutate(job.id)}>
                          Archive
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {jobs.length > 0 && (
        <Card className="mt-4">
          <p className="text-xs text-muted">
            Editing the substance of a live listing — title, description, requirements, salary,
            location or experience — sends it back for review and hides it until re-approved.
            Fixing a typo in the department name does not.
          </p>
        </Card>
      )}
    </div>
  );
};

/**
 * "Visible now", with the reason when the answer is no.
 *
 * A bare "No" against an APPROVED badge looks broken. Naming the cause — deadline passed,
 * awaiting review, company suspended — is the difference between a confusing table and an
 * actionable one.
 */
const VisibilityCell = ({ job }) => {
  if (job.isPubliclyVisible) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-accent-600 dark:text-accent-300">
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
        Live
      </span>
    );
  }

  const reason =
    job.status === JOB_STATUS.APPROVED && new Date(job.deadline) < new Date()
      ? 'Deadline passed'
      : job.status === JOB_STATUS.APPROVED
        ? 'Hidden — check your company status'
        : REASON_BY_STATUS[job.status];

  return (
    <span className="text-sm text-muted">
      No
      {reason && <span className="block text-xs">{reason}</span>}
    </span>
  );
};

const REASON_BY_STATUS = {
  [JOB_STATUS.DRAFT]: 'Not submitted',
  [JOB_STATUS.PENDING]: 'Awaiting review',
  [JOB_STATUS.REJECTED]: 'Rejected — see the listing',
  [JOB_STATUS.ARCHIVED]: 'Archived by you',
};

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

export default EmployerJobs;
