import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { VERIFICATION_STATUS, VERIFICATION_STATUS_META } from '@verihire/shared';
import { employerApi } from '../../api/services/index.js';
import { Button } from '../../components/ui/Button.jsx';
import { Alert, ErrorState, Skeleton } from '../../components/ui/Feedback.jsx';
import { PageHeader, Card } from '../../components/ui/Card.jsx';
import { VerificationBadge } from '../../components/ui/Badge.jsx';
import { cn } from '../../utils/cn.js';

/**
 * ★ The employer's side of gate 1.
 *
 * This is the screen an employer stares at while they wait, so it is written to answer the
 * three questions they actually have — what is my status, what is still missing, and how long
 * will this take — rather than to restate the policy.
 *
 * The honesty rule: when a submission is rejected, this page shows the admin's reason
 * verbatim and offers resubmission. Softening or summarising it would leave the employer
 * unable to fix the thing that was actually wrong.
 */
export const Verification = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['employer', 'verification'],
    queryFn: employerApi.verificationStatus,
    // Polled while under review so approval appears without the employer refreshing —
    // people do sit on this page waiting.
    refetchInterval: (query) =>
      query.state.data?.verificationStatus === VERIFICATION_STATUS.PENDING ? 30_000 : false,
  });

  const submit = useMutation({
    mutationFn: employerApi.submitVerification,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employer'] }),
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (isError) return <ErrorState message={error?.message} onRetry={refetch} />;

  const status = data?.verificationStatus ?? VERIFICATION_STATUS.UNSUBMITTED;
  const meta = VERIFICATION_STATUS_META[status] ?? {};
  const readiness = data?.readiness ?? { isReady: false, missing: [] };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Company verification"
        description="Candidates only see listings from companies we have checked. This is that check."
      />

      <Card className="mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <VerificationBadge status={status} />
            <p className="mt-2 text-sm text-muted">{meta.description}</p>
          </div>
          {data?.canPostJobs && (
            <Link to="/employer/jobs/new">
              <Button>Post a job</Button>
            </Link>
          )}
        </div>
      </Card>

      {/* ★ Rejected — the reason, verbatim, and a way forward. */}
      {status === VERIFICATION_STATUS.REJECTED && (
        <Alert tone="danger" title="What we found" className="mb-4">
          <p className="whitespace-pre-wrap">{data?.verification?.rejectionReason}</p>
          <p className="mt-2 text-xs opacity-80">
            Fix the points above, then resubmit. There is no limit on resubmissions.
          </p>
        </Alert>
      )}

      {status === VERIFICATION_STATUS.PENDING && (
        <Alert tone="info" className="mb-4">
          Submitted {formatDate(data?.verification?.submittedAt)}. A person reads every
          submission — this usually takes 24 to 48 hours, and you will get an email either way.
        </Alert>
      )}

      {/*
        The readiness checklist mirrors the server's `getSubmissionReadiness()`. It exists so
        an employer knows exactly what is missing before they submit, instead of being
        rejected for an omission the form could have told them about.
      */}
      {status !== VERIFICATION_STATUS.VERIFIED && (
        <Card className="mb-4">
          <h2 className="mb-3 text-sm font-semibold">Before you submit</h2>
          <ul className="space-y-2">
            {(readiness.checks ?? DEFAULT_CHECKS).map((check) => (
              <li key={check.key} className="flex items-start gap-2 text-sm">
                <CheckMark done={check.done} />
                <span className={cn(check.done ? 'text-muted line-through' : 'text-ink')}>
                  {check.label}
                </span>
              </li>
            ))}
          </ul>

          {readiness.missing?.length > 0 && (
            <p className="mt-3 text-xs text-muted">
              Complete the outstanding items on your{' '}
              <Link to="/employer/company" className="text-brand-500 hover:underline">
                company profile
              </Link>
              .
            </p>
          )}

          {submit.isError && (
            <Alert tone="danger" className="mt-3">
              {submit.error?.message}
            </Alert>
          )}

          <div className="mt-4 flex justify-end">
            <Button
              disabled={!readiness.isReady || status === VERIFICATION_STATUS.PENDING}
              isLoading={submit.isPending}
              onClick={() => submit.mutate()}
            >
              {status === VERIFICATION_STATUS.REJECTED ? 'Resubmit for review' : 'Submit for review'}
            </Button>
          </div>
        </Card>
      )}

      {status === VERIFICATION_STATUS.VERIFIED && (
        <Alert tone="success" title="You are verified">
          Your company badge appears on every listing you publish. Jobs still go through a
          separate review before they go live — that second check is what candidates are
          trusting when they apply.
        </Alert>
      )}
    </div>
  );
};

/** Fallback when the server has not sent a structured checklist. */
const DEFAULT_CHECKS = [
  { key: 'profile', label: 'Complete your company profile', done: false },
  { key: 'documents', label: 'Upload incorporation and signatory ID documents', done: false },
  { key: 'contact', label: 'Add a contact email on your company domain', done: false },
];

const CheckMark = ({ done }) => (
  <span
    aria-hidden="true"
    className={cn(
      'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[10px]',
      done
        ? 'border-accent-600 bg-accent-600 text-white'
        : 'border-border text-transparent',
    )}
  >
    ✓
  </span>
);

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'recently';

export default Verification;
