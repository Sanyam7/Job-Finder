import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { JOB_REJECTION_CATEGORY_META, JOB_STATUS, JOB_STATUS_META } from '@verihire/shared';
import { adminApi } from '../../api/services/index.js';
import { Button } from '../../components/ui/Button.jsx';
import { Textarea, Select, Checkbox } from '../../components/ui/Input.jsx';
import { Badge, JobStatusBadge, VerifiedMark } from '../../components/ui/Badge.jsx';
import { Alert, EmptyState, ErrorState, TableSkeleton } from '../../components/ui/Feedback.jsx';
import { PageHeader, Card } from '../../components/ui/Card.jsx';
import { cn } from '../../utils/cn.js';

/**
 * ★★ GATE 2 — the job approval queue.
 *
 * Two design decisions carry real weight here:
 *
 *  **Revisions are flagged loudly.** A job with `revisionCount > 0` was approved once and then
 *  materially edited, which sent it back for re-review. That is precisely the fraud vector the
 *  material-edit rule closes — get a clean listing approved, then rewrite it — so those rows
 *  are marked and sorted to the top of an admin's attention rather than blending in.
 *
 *  **Bulk approve exists, but only for the safe direction.** There is no bulk reject: a
 *  rejection requires a reason written for that specific listing, and a bulk reason would
 *  either be useless boilerplate or wrong for most of the batch.
 */
export const JobQueue = () => {
  // Annotated because `useState('PENDING')` infers the literal, and the filter dropdown then
  // cannot set any other status.
  const [status, setStatus] = useState(/** @type {string} */ (JOB_STATUS.PENDING));
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [reviewingId, setReviewingId] = useState(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'jobs', status],
    queryFn: () => adminApi.listJobs({ status, sort: 'oldest' }),
    refetchInterval: 30_000,
  });

  const bulkApprove = useMutation({
    mutationFn: () => adminApi.bulkApproveJobs([...selectedIds]),
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  const rows = data?.items ?? [];
  const revisions = rows.filter((job) => job.isRevision);

  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <PageHeader
        title="Job approval"
        description="A listing reaches candidates only after someone here reads it."
        actions={
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setSelectedIds(new Set());
            }}
            options={Object.entries(JOB_STATUS_META).map(([value, meta]) => ({
              value,
              label: meta.label,
            }))}
          />
        }
      />

      {/* ★ The fraud vector, surfaced before anything else on the page. */}
      {revisions.length > 0 && (
        <Alert tone="warning" title="Re-review required" className="mb-4">
          {revisions.length} listing{revisions.length === 1 ? ' was' : 's were'} approved and then
          edited. Read the changed content carefully — this is the route a cleared listing gets
          rewritten into something else.
        </Alert>
      )}

      {isError && <ErrorState message={error?.message} onRetry={refetch} />}
      {isLoading && <TableSkeleton rows={5} columns={4} />}

      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState
          title={status === JOB_STATUS.PENDING ? 'Queue is clear' : 'Nothing here'}
          description={
            status === JOB_STATUS.PENDING
              ? 'New submissions appear automatically. Nothing is waiting on you.'
              : undefined
          }
        />
      )}

      {status === JOB_STATUS.PENDING && selectedIds.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-border bg-elevated px-4 py-2">
          <span className="text-sm">{selectedIds.size} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
            <Button
              variant="success"
              size="sm"
              isLoading={bulkApprove.isPending}
              onClick={() => bulkApprove.mutate()}
            >
              Approve {selectedIds.size}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((job) => (
          <Card key={job.id} className={cn(job.isRevision && 'border-warn-500/50')}>
            <div className="flex items-start gap-3">
              {status === JOB_STATUS.PENDING && (
                <Checkbox
                  checked={selectedIds.has(job.id)}
                  onChange={() => toggleSelect(job.id)}
                  label=""
                  aria-label={`Select ${job.title}`}
                />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink">{job.title}</h3>
                  {job.isRevision && (
                    <Badge tone="warning" size="sm">
                      Revision {job.revisionCount}
                    </Badge>
                  )}
                  {status !== JOB_STATUS.PENDING && <JobStatusBadge status={job.status} />}
                </div>

                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span>{job.company?.name}</span>
                  {/*
                    A pending job from a verified company is the normal case — gate 1 passed,
                    gate 2 has not. Showing the company's state here saves a click.
                  */}
                  {job.company?.isVerified && <VerifiedMark size="sm" withLabel={false} />}
                  <span aria-hidden="true">·</span>
                  <span>{job.locationLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{job.salaryLabel}</span>
                </div>

                {job.waitingHours != null && (
                  <p
                    className={cn(
                      'mt-1 text-xs',
                      job.waitingHours > 24 ? 'font-medium text-warn-600' : 'text-muted',
                    )}
                  >
                    Waiting {job.waitingHours}h
                  </p>
                )}
              </div>

              {status === JOB_STATUS.PENDING && (
                <Button size="sm" onClick={() => setReviewingId(job.id)}>
                  Review
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {reviewingId && (
        <ReviewDialog jobId={reviewingId} onClose={() => setReviewingId(null)} />
      )}
    </div>
  );
};

const ReviewDialog = ({ jobId, onClose }) => {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('approve');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('INCOMPLETE');

  const { data: job, isLoading } = useQuery({
    queryKey: ['admin', 'job', jobId],
    queryFn: () => adminApi.getJob(jobId),
  });

  const finish = () => {
    queryClient.invalidateQueries({ queryKey: ['admin'] });
    onClose();
  };

  const approve = useMutation({
    mutationFn: () => adminApi.approveJob(jobId, {}),
    onSuccess: finish,
  });

  const reject = useMutation({
    mutationFn: () => adminApi.rejectJob(jobId, { reason, category }),
    onSuccess: finish,
  });

  const reasonValid = reason.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6">
      <Card
        role="dialog"
        aria-modal="true"
        aria-label="Review job"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto"
      >
        {isLoading && <p className="text-sm text-muted">Loading…</p>}

        {job && (
          <>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold">{job.title}</h2>
                <p className="text-sm text-muted">{job.company?.name}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>

            {job.moderation?.revisionCount > 0 && (
              <Alert tone="warning" title="This listing was already approved once" className="mb-4">
                It was edited afterwards, which withdrew it and sent it back here. Compare it
                against what you would expect from this company before approving again.
              </Alert>
            )}

            <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <Field label="Employment" value={job.employmentType} />
              <Field label="Work mode" value={job.workMode} />
              <Field label="Location" value={job.locationLabel} />
              <Field label="Salary" value={job.salaryLabel} />
              <Field label="Experience" value={job.experienceLabel} />
              <Field label="Openings" value={job.openings} />
            </div>

            <section className="mb-4">
              <h3 className="mb-1 text-sm font-semibold">Description</h3>
              <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-elevated p-3 text-sm">
                {job.description}
              </p>
            </section>

            {job.requirements?.length > 0 && (
              <section className="mb-4">
                <h3 className="mb-1 text-sm font-semibold">Requirements</h3>
                <ul className="list-inside list-disc text-sm text-muted">
                  {job.requirements.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>
            )}

            <div className="mb-4 flex gap-2 border-b border-border">
              <TabButton active={mode === 'approve'} onClick={() => setMode('approve')}>
                Approve
              </TabButton>
              <TabButton active={mode === 'reject'} onClick={() => setMode('reject')}>
                Reject
              </TabButton>
            </div>

            {mode === 'approve' ? (
              <>
                <Alert tone="info">
                  Approving publishes this immediately, provided the company is still verified
                  and active. If they were suspended since submitting, it stays hidden.
                </Alert>
                {approve.isError && (
                  <Alert tone="danger" className="mt-3">
                    {approve.error?.message}
                  </Alert>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    variant="success"
                    isLoading={approve.isPending}
                    onClick={() => approve.mutate()}
                  >
                    Approve and publish
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Select
                  label="Category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  options={Object.entries(JOB_REJECTION_CATEGORY_META).map(([value, meta]) => ({
                    value,
                    label: meta.label,
                  }))}
                />
                <Textarea
                  label="Reason"
                  required
                  value={reason}
                  maxLength={1000}
                  onChange={(event) => setReason(event.target.value)}
                  hint="The employer sees this word for word. Say what to change so they can fix it and resubmit."
                  error={reason && !reasonValid ? 'At least 10 characters' : undefined}
                />
                {reject.isError && <Alert tone="danger">{reject.error?.message}</Alert>}
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    disabled={!reasonValid}
                    isLoading={reject.isPending}
                    onClick={() => reject.mutate()}
                  >
                    Reject listing
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

const Field = ({ label, value }) => (
  <div>
    <p className="text-xs text-muted">{label}</p>
    <p className="text-ink">{value ?? '—'}</p>
  </div>
);

const TabButton = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
      active ? 'border-brand-500 text-brand-500' : 'border-transparent text-muted hover:text-ink',
    )}
  >
    {children}
  </button>
);

export default JobQueue;
