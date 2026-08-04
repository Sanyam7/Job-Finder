import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  APPLICATION_PIPELINE,
  APPLICATION_STATUS,
  APPLICATION_STATUS_META,
} from '@verihire/shared';
import { applicationApi } from '../../api/services/index.js';
import { Button } from '../../components/ui/Button.jsx';
import { ApplicationStatusBadge } from '../../components/ui/Badge.jsx';
import { Alert, EmptyState, ErrorState, TableSkeleton } from '../../components/ui/Feedback.jsx';
import { PageHeader, Card } from '../../components/ui/Card.jsx';
import { cn } from '../../utils/cn.js';

/**
 * The candidate's application tracker.
 *
 * ★ The reason this screen exists at all: being ghosted is the defining experience of job
 * hunting. Every row shows where the application actually is, whether the employer opened it,
 * and — when they said no — the reason they gave, verbatim.
 *
 * `wasViewed` is deliberately surfaced. "Applied 9 days ago, not yet opened" is unwelcome but
 * true, and it lets someone stop waiting and move on. Hiding it would be kinder for one
 * afternoon and worse for a job search.
 */
export const Applications = () => {
  const [statusFilter, setStatusFilter] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['applications', 'mine', statusFilter],
    queryFn: () => applicationApi.mine({ status: statusFilter || undefined }),
  });

  const { data: stats } = useQuery({
    queryKey: ['applications', 'mine', 'stats'],
    queryFn: applicationApi.myStats,
  });

  const withdraw = useMutation({
    /*
     * The inline annotation is what gives the mutation its variables type. TanStack Query
     * infers `TVariables` from `mutationFn`; an unannotated parameter gives it nothing, so it
     * lands on `void` and every `.mutate({id, reason})` is an error. The annotation has to sit
     * on the parameter itself — a doc comment above the property does not attach to it.
     */
    mutationFn: (/** @type {{id: string, reason?: string}} */ vars) =>
      applicationApi.withdraw(vars.id, vars.reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });

  const rows = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Your applications"
        description="Every company here was verified by our team before they could post."
      />

      {/* Status tabs double as the summary — one row of numbers instead of a chart nobody reads. */}
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip
          label="All"
          count={stats?.total}
          active={!statusFilter}
          onClick={() => setStatusFilter('')}
        />
        {[
          APPLICATION_STATUS.APPLIED,
          APPLICATION_STATUS.VIEWED,
          APPLICATION_STATUS.SHORTLISTED,
          APPLICATION_STATUS.INTERVIEW,
          APPLICATION_STATUS.HIRED,
          APPLICATION_STATUS.REJECTED,
        ].map((status) => (
          <FilterChip
            key={status}
            label={APPLICATION_STATUS_META[status]?.label ?? status}
            count={stats?.[status]}
            active={statusFilter === status}
            onClick={() => setStatusFilter(status)}
          />
        ))}
      </div>

      {isError && <ErrorState message={error?.message} onRetry={refetch} />}
      {isLoading && <TableSkeleton rows={4} columns={3} />}

      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState
          title={statusFilter ? 'Nothing at this stage' : "You haven't applied to anything yet"}
          description={
            statusFilter
              ? undefined
              : 'Every listing on VeriHire is from a company we checked and a posting a person reviewed.'
          }
          action={
            statusFilter
              ? { label: 'Show all', onClick: () => setStatusFilter('') }
              : { label: 'Browse jobs', onClick: () => window.location.assign('/jobs') }
          }
        />
      )}

      <div className="space-y-3">
        {rows.map((application) => (
          <ApplicationRow
            key={application.id}
            application={application}
            onWithdraw={(reason) => withdraw.mutate({ id: application.id, reason })}
            isWithdrawing={withdraw.isPending && withdraw.variables?.id === application.id}
          />
        ))}
      </div>
    </div>
  );
};

const ApplicationRow = ({ application, onWithdraw, isWithdrawing }) => {
  const [isConfirmingWithdraw, setConfirming] = useState(false);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">
            <Link to={`/jobs/${application.job?.slug}`} className="hover:text-brand-500">
              {application.job?.title}
            </Link>
          </h3>
          <p className="text-sm text-muted">
            {application.job?.company?.name} · applied{' '}
            {new Date(application.appliedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ApplicationStatusBadge status={application.status} />
          {application.canWithdraw && !isConfirmingWithdraw && (
            <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
              Withdraw
            </Button>
          )}
        </div>
      </div>

      <Pipeline status={application.status} />

      {/*
        ★ "Not yet opened" is shown honestly. It is the single most useful fact a waiting
        candidate can have, and softening it would only postpone the same conclusion.
      */}
      {application.status === APPLICATION_STATUS.APPLIED && (
        <p className="mt-2 text-xs text-muted">
          {application.wasViewed
            ? 'The employer has opened your application.'
            : 'Not opened yet.'}
        </p>
      )}

      {application.interviewAt && (
        <Alert tone="success" className="mt-3">
          Interview scheduled for{' '}
          {new Date(application.interviewAt).toLocaleString(undefined, {
            dateStyle: 'full',
            timeStyle: 'short',
          })}
        </Alert>
      )}

      {isConfirmingWithdraw && (
        <div className="mt-3 rounded-md border border-border bg-elevated p-3">
          <p className="text-sm text-ink">Withdraw this application?</p>
          {/* Stated because the unique index makes it true — withdrawing is final. */}
          <p className="mt-1 text-xs text-muted">
            You will not be able to apply to this job again.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={isWithdrawing}
              onClick={() => onWithdraw('Withdrawn by candidate')}
            >
              Withdraw
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

/**
 * The stage indicator.
 *
 * Terminal negative states (rejected, withdrawn) leave the pipeline entirely rather than
 * rendering as a "failed" final step — a greyed-out track with a red cross at the end is a
 * needlessly bleak way to show a normal outcome.
 */
const Pipeline = ({ status }) => {
  const currentStep = APPLICATION_STATUS_META[status]?.step ?? 0;

  if (currentStep === 0) {
    return (
      <p className="mt-2 text-sm text-muted">
        {APPLICATION_STATUS_META[status]?.candidateMessage}
      </p>
    );
  }

  return (
    <ol className="mt-3 flex items-center gap-1" aria-label="Application progress">
      {APPLICATION_PIPELINE.map((stage) => {
        const step = APPLICATION_STATUS_META[stage]?.step ?? 0;
        const reached = currentStep >= step;

        return (
          <li key={stage} className="flex flex-1 flex-col gap-1">
            <span
              className={cn('h-1 rounded-full', reached ? 'bg-accent-600' : 'bg-border')}
              aria-hidden="true"
            />
            <span
              className={cn(
                'text-[11px]',
                stage === status ? 'font-semibold text-ink' : 'text-muted',
              )}
            >
              {APPLICATION_STATUS_META[stage]?.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

const FilterChip = ({ label, count, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      'rounded-full border px-3 py-1 text-sm transition-colors',
      active
        ? 'border-brand-500 bg-brand-500 text-white'
        : 'border-border text-muted hover:border-muted hover:text-ink',
    )}
  >
    {label}
    {count != null && <span className="ml-1.5 tabular-nums opacity-80">{count}</span>}
  </button>
);

export default Applications;
