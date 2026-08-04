import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { APPLICATION_PIPELINE, APPLICATION_STATUS, APPLICATION_STATUS_META } from '@verihire/shared';
import { applicationApi, jobApi } from '../../api/services/index.js';
import { Button } from '../../components/ui/Button.jsx';
import { Textarea, Select, Input } from '../../components/ui/Input.jsx';
import { ApplicationStatusBadge, Badge } from '../../components/ui/Badge.jsx';
import { Alert, EmptyState, ErrorState, TableSkeleton } from '../../components/ui/Feedback.jsx';
import { PageHeader, Card, StatCard } from '../../components/ui/Card.jsx';
import { cn } from '../../utils/cn.js';

/**
 * The employer's applicant inbox for one job.
 *
 * ★ Contact details are masked until the candidate is shortlisted, and the UI says so rather
 * than silently showing `p•••@gmail.com`. An employer who does not know why the email is
 * obscured assumes the data is broken; one who knows the rule can act on it.
 *
 * The resume is fetched through a separate audited endpoint on click. It is never in the list
 * payload — a pre-signed URL sitting in JSON would bypass the audit entirely, and "who
 * downloaded my CV" is a question this platform should be able to answer.
 */
export const Applicants = () => {
  const { id: jobId } = useParams();
  const [statusFilter, setStatusFilter] = useState('');
  const [openId, setOpenId] = useState(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['job', jobId, 'applicants', statusFilter],
    queryFn: () => jobApi.applicants(jobId, { status: statusFilter || undefined }),
  });

  const rows = data?.items ?? [];
  const funnel = data?.summary?.funnel;

  return (
    <div>
      <PageHeader
        title={data?.summary?.jobTitle ?? 'Applicants'}
        description="Candidates who applied to this role."
      />

      {funnel && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {funnel.stages.map((stage) => (
            <StatCard
              key={stage.status}
              label={APPLICATION_STATUS_META[stage.status]?.label ?? stage.status}
              value={stage.count}
              tone={stage.status === APPLICATION_STATUS.HIRED ? 'success' : 'neutral'}
            />
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip label="All" active={!statusFilter} onClick={() => setStatusFilter('')} />
        {APPLICATION_PIPELINE.map((status) => (
          <FilterChip
            key={status}
            label={APPLICATION_STATUS_META[status]?.label}
            active={statusFilter === status}
            onClick={() => setStatusFilter(status)}
          />
        ))}
      </div>

      {isError && <ErrorState message={error?.message} onRetry={refetch} />}
      {isLoading && <TableSkeleton rows={4} columns={4} />}

      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState
          title="No applicants yet"
          description="Verified listings typically take a few days to gather applications. Sharing the link helps."
          size="sm"
        />
      )}

      <div className="space-y-2">
        {rows.map((application) => (
          <Card key={application.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink">
                    {application.candidate?.firstName} {application.candidate?.lastName}
                  </h3>
                  <ApplicationStatusBadge status={application.status} />
                  {application.isNew && (
                    <Badge tone="info" size="sm">
                      New
                    </Badge>
                  )}
                </div>

                <p className="text-sm text-muted">{application.candidate?.headline}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {application.candidate?.currentCompany} ·{' '}
                  {Math.floor((application.candidate?.totalExperienceMonths ?? 0) / 12)} yrs ·{' '}
                  {application.candidate?.locationLabel}
                </p>

                <div className="mt-2 flex flex-wrap gap-1">
                  {application.candidate?.skills?.slice(0, 6).map((skill) => (
                    <Badge key={skill} tone="neutral" size="sm">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>

              <Button size="sm" variant="secondary" onClick={() => setOpenId(application.id)}>
                Open
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {openId && (
        <ApplicantDialog
          applicationId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['job', jobId] })}
        />
      )}
    </div>
  );
};

const ApplicantDialog = ({ applicationId, onClose, onChanged }) => {
  const queryClient = useQueryClient();
  const [rejectReason, setRejectReason] = useState('');
  const [notes, setNotes] = useState(null);
  const [interview, setInterview] = useState({ scheduledAt: '', mode: 'ONLINE', meetingLink: '' });
  const [panel, setPanel] = useState(null);

  const { data: application, isLoading } = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => applicationApi.get(applicationId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['application', applicationId] });
    onChanged?.();
  };

  const markViewed = useMutation({
    mutationFn: () => applicationApi.markViewed(applicationId),
    onSuccess: invalidate,
  });

  /**
   * ★ Opening an applicant marks it viewed.
   *
   * That is the employer's actual intent, and making them press a separate "mark as viewed"
   * button guarantees stale funnels — and leaves the candidate's tracker saying "not opened
   * yet" about an application somebody read a week ago.
   *
   * This was previously an `onSuccess` callback on the query, which TanStack Query **removed
   * in v5** — so it silently never ran. An effect keyed on the loaded application is the
   * supported replacement. The ref guards against the double-fire that would otherwise happen
   * when `invalidate()` refetches and the effect sees `APPLIED` again before the write lands.
   */
  const viewedRef = useRef(null);

  useEffect(() => {
    if (!application || application.status !== APPLICATION_STATUS.APPLIED) return;
    if (viewedRef.current === applicationId) return;

    viewedRef.current = applicationId;
    markViewed.mutate();
    // `markViewed` is stable for the life of the dialog; including it would re-run the effect
    // on every render of the mutation object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application, applicationId]);
  const shortlist = useMutation({
    mutationFn: () => applicationApi.shortlist(applicationId, {}),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: () => applicationApi.reject(applicationId, { reason: rejectReason }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });
  const hire = useMutation({
    mutationFn: () => applicationApi.hire(applicationId, {}),
    onSuccess: invalidate,
  });
  const scheduleInterview = useMutation({
    mutationFn: () => applicationApi.scheduleInterview(applicationId, interview),
    onSuccess: () => {
      invalidate();
      setPanel(null);
    },
  });
  const saveNotes = useMutation({
    mutationFn: () => applicationApi.updateNotes(applicationId, { notes }),
    onSuccess: invalidate,
  });

  const [isFetchingResume, setFetchingResume] = useState(false);
  const openResume = async () => {
    setFetchingResume(true);
    try {
      const { url } = await applicationApi.resumeUrl(applicationId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setFetchingResume(false);
    }
  };

  const candidate = application?.candidate;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:p-6">
      <Card
        role="dialog"
        aria-modal="true"
        aria-label="Applicant"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto"
      >
        {isLoading && <p className="text-sm text-muted">Loading…</p>}

        {application && (
          <>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold">
                  {candidate?.firstName} {candidate?.lastName}
                </h2>
                <p className="text-sm text-muted">{candidate?.headline}</p>
                <div className="mt-1">
                  <ApplicationStatusBadge status={application.status} />
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>

            {/* ★ The masking rule, explained rather than merely applied. */}
            {!candidate?.contactUnlocked && (
              <Alert tone="info" className="mb-4">
                Contact details unlock when you shortlist this candidate. Their profile,
                experience and resume are fully available now.
              </Alert>
            )}

            <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <Field label="Email" value={candidate?.email} />
              <Field label="Phone" value={candidate?.phone} />
              <Field label="Experience" value={candidate?.experienceLabel} />
              <Field label="Notice period" value={`${application.noticePeriodDays ?? '—'} days`} />
              <Field label="Expected salary" value={application.expectedSalaryLabel} />
              <Field
                label="Applied"
                value={new Date(application.appliedAt).toLocaleDateString(undefined, {
                  dateStyle: 'medium',
                })}
              />
            </dl>

            {application.coverLetter && (
              <section className="mb-4">
                <h3 className="mb-1 text-sm font-semibold">Cover note</h3>
                <p className="whitespace-pre-wrap rounded-md border border-border bg-elevated p-3 text-sm">
                  {application.coverLetter}
                </p>
              </section>
            )}

            {application.resume?.hasResume && (
              <div className="mb-4 flex items-center justify-between rounded-md border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{application.resume.originalName}</p>
                  <p className="text-xs text-muted">
                    The candidate is told when their resume is opened.
                  </p>
                </div>
                <Button size="sm" isLoading={isFetchingResume} onClick={openResume}>
                  Open resume
                </Button>
              </div>
            )}

            <section className="mb-4">
              <h3 className="mb-1 text-sm font-semibold">Your private notes</h3>
              <Textarea
                value={notes ?? application.employerNotes ?? ''}
                onChange={(event) => setNotes(event.target.value)}
                onBlur={() => notes !== null && saveNotes.mutate()}
                // Stated because the DTO guarantees it and an employer needs to know they
                // can write frankly.
                hint="Only your team sees these. They are never shown to the candidate."
                maxLength={2000}
              />
            </section>

            {panel === 'interview' && (
              <Card className="mb-4 bg-elevated">
                <h3 className="mb-2 text-sm font-semibold">Schedule an interview</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    label="When"
                    type="datetime-local"
                    value={interview.scheduledAt}
                    onChange={(e) => setInterview({ ...interview, scheduledAt: e.target.value })}
                  />
                  <Select
                    label="Format"
                    value={interview.mode}
                    onChange={(e) => setInterview({ ...interview, mode: e.target.value })}
                    options={[
                      { value: 'ONLINE', label: 'Online' },
                      { value: 'ONSITE', label: 'On site' },
                      { value: 'PHONE', label: 'Phone' },
                    ]}
                  />
                </div>
                {interview.mode === 'ONLINE' && (
                  <Input
                    label="Meeting link"
                    required
                    value={interview.meetingLink}
                    onChange={(e) => setInterview({ ...interview, meetingLink: e.target.value })}
                    // A missing link is the most common reason a candidate misses an
                    // interview, so the API requires it and so does this form.
                    hint="Sent to the candidate with the invitation"
                  />
                )}
                {scheduleInterview.isError && (
                  <Alert tone="danger">{scheduleInterview.error?.message}</Alert>
                )}
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setPanel(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    isLoading={scheduleInterview.isPending}
                    onClick={() => scheduleInterview.mutate()}
                  >
                    Schedule
                  </Button>
                </div>
              </Card>
            )}

            {panel === 'reject' && (
              <Card className="mb-4 bg-elevated">
                <Textarea
                  label="Why not?"
                  required
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  hint="The candidate reads this. A specific sentence is worth more than a template."
                  maxLength={1000}
                />
                {reject.isError && <Alert tone="danger">{reject.error?.message}</Alert>}
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setPanel(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={rejectReason.trim().length < 10}
                    isLoading={reject.isPending}
                    onClick={() => reject.mutate()}
                  >
                    Send rejection
                  </Button>
                </div>
              </Card>
            )}

            {/*
              ★ Buttons come from `allowedTransitions`, which the server derives from the same
              state machine it enforces. The UI cannot offer an action the API will refuse.
            */}
            {!panel && (
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                {application.allowedTransitions?.map((transition) => (
                  <Button
                    key={transition.status}
                    size="sm"
                    variant={
                      transition.status === APPLICATION_STATUS.REJECTED
                        ? 'danger'
                        : transition.status === APPLICATION_STATUS.HIRED
                          ? 'success'
                          : 'secondary'
                    }
                    isLoading={
                      (transition.status === APPLICATION_STATUS.SHORTLISTED && shortlist.isPending) ||
                      (transition.status === APPLICATION_STATUS.HIRED && hire.isPending)
                    }
                    onClick={() => {
                      if (transition.status === APPLICATION_STATUS.SHORTLISTED) shortlist.mutate();
                      else if (transition.status === APPLICATION_STATUS.HIRED) hire.mutate();
                      else if (transition.status === APPLICATION_STATUS.REJECTED) setPanel('reject');
                      else if (transition.status === APPLICATION_STATUS.INTERVIEW) setPanel('interview');
                      else if (transition.status === APPLICATION_STATUS.VIEWED) markViewed.mutate();
                    }}
                  >
                    {transition.label}
                  </Button>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

const Field = ({ label, value }) => (
  <div>
    <dt className="text-xs text-muted">{label}</dt>
    <dd className="truncate text-ink">{value || '—'}</dd>
  </div>
);

const FilterChip = ({ label, active, onClick }) => (
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
  </button>
);

export default Applicants;
