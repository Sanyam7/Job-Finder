import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ERROR_CODES, LIMITS } from '@verihire/shared';
import { applicationApi, candidateApi } from '../../api/services/index.js';
import { Button } from '../../components/ui/Button.jsx';
import { Textarea, Input } from '../../components/ui/Input.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { Card } from '../../components/ui/Card.jsx';

/**
 * The apply dialog.
 *
 * ★ Every one of the API's refusal codes is handled explicitly here, because each one has a
 * different fix and a generic "something went wrong" leaves the candidate with no next step:
 *
 *  - `RESUME_REQUIRED` → link to the upload, not an error
 *  - `ALREADY_APPLIED` → say so calmly and link to the tracker
 *  - `JOB_NOT_ACCEPTING_APPLICATIONS` → the listing was pulled or expired *while they typed*,
 *    which is exactly the race the server re-checks inside its transaction
 */
/**
 * The refusals this dialog explains individually. Anything else falls through to the generic
 * error alert.
 *
 * Named and typed `string[]` so the membership test compares against the whole `ERROR_CODES`
 * union rather than these three literals.
 *
 * @type {string[]}
 */
const HANDLED_CODES = [
  ERROR_CODES.ALREADY_APPLIED,
  ERROR_CODES.JOB_NOT_ACCEPTING_APPLICATIONS,
  ERROR_CODES.RESUME_REQUIRED,
];

export const ApplyDialog = ({ job, onClose }) => {
  const queryClient = useQueryClient();
  const dialogRef = useRef(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [noticePeriodDays, setNoticePeriodDays] = useState('');
  const [expectedMin, setExpectedMin] = useState('');

  const { data: profile } = useQuery({
    queryKey: ['candidate', 'me'],
    queryFn: candidateApi.me,
  });

  const apply = useMutation({
    mutationFn: () =>
      applicationApi.apply({
        jobId: job.id,
        coverLetter: coverLetter.trim() || undefined,
        noticePeriodDays: noticePeriodDays === '' ? undefined : Number(noticePeriodDays),
        expectedSalary: expectedMin ? { min: Number(expectedMin) } : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['public', 'job', job.slug] });
    },
  });

  /** Escape closes, and focus moves into the dialog on open. */
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !apply.isPending) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, apply.isPending]);

  const errorCode = apply.error?.code;
  const hasResume = profile?.resume?.hasResume;

  if (apply.isSuccess) {
    return (
      <Backdrop onClose={onClose}>
        <Card className="w-full max-w-md text-center">
          <div className="mb-3 grid h-12 w-12 mx-auto place-items-center rounded-full bg-accent-50 text-accent-600 dark:bg-accent-700/20">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-lg font-bold">Application sent</h2>
          <p className="mt-1 text-sm text-muted">
            {job.company?.name} has your application for {job.title}. You&apos;ll be notified as
            soon as they look at it.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Keep browsing
            </Button>
            <Link to="/candidate/applications">
              <Button>Track application</Button>
            </Link>
          </div>
        </Card>
      </Backdrop>
    );
  }

  return (
    <Backdrop onClose={apply.isPending ? undefined : onClose}>
      <Card
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Apply for ${job.title}`}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto focus:outline-none"
      >
        <h2 className="text-lg font-bold">Apply for {job.title}</h2>
        <p className="mt-0.5 text-sm text-muted">{job.company?.name}</p>

        {/* ★ Resume gate, surfaced before they write anything rather than after. */}
        {profile && !hasResume && (
          <Alert tone="warning" title="You need a resume on file" className="mt-4">
            <p>
              {job.company?.name} has been verified and reviewed — they should get a real
              application in return.
            </p>
            <Link
              to="/candidate/profile"
              className="mt-1 inline-block font-medium underline underline-offset-2"
            >
              Upload your resume →
            </Link>
          </Alert>
        )}

        {errorCode === ERROR_CODES.ALREADY_APPLIED && (
          <Alert tone="info" className="mt-4">
            You already applied to this role.{' '}
            <Link to="/candidate/applications" className="font-medium underline">
              See your applications
            </Link>
            .
          </Alert>
        )}

        {errorCode === ERROR_CODES.JOB_NOT_ACCEPTING_APPLICATIONS && (
          <Alert tone="warning" title="This listing is no longer open" className="mt-4">
            It closed or was withdrawn while you were writing. Nothing was submitted.
          </Alert>
        )}

        {apply.isError && !HANDLED_CODES.includes(errorCode) && (
          <Alert tone="danger" className="mt-4">
            {apply.error?.message}
          </Alert>
        )}

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            apply.mutate();
          }}
        >
          <Textarea
            label="Cover note"
            value={coverLetter}
            maxLength={LIMITS.MAX_COVER_LETTER_LENGTH}
            onChange={(event) => setCoverLetter(event.target.value)}
            placeholder={`Why are you a good fit for ${job.title}?`}
            hint="Optional, but employers read these."
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Notice period (days)"
              type="number"
              min={0}
              max={LIMITS.MAX_NOTICE_PERIOD_DAYS}
              value={noticePeriodDays}
              onChange={(event) => setNoticePeriodDays(event.target.value)}
              hint="Leave blank to use your profile default"
            />
            <Input
              label="Expected salary (min)"
              type="number"
              min={0}
              value={expectedMin}
              onChange={(event) => setExpectedMin(event.target.value)}
              hint="Optional"
            />
          </div>

          <div className="rounded-md border border-border bg-elevated p-3 text-xs text-muted">
            {/*
              Says exactly what is sent. A candidate should never be surprised later to learn
              their phone number went with the application.
            */}
            Your profile, contact details and the resume currently on file are sent with this
            application. {job.company?.name} sees your contact details once they shortlist you.
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={apply.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              // Disabled without a resume: the API refuses it, so offering the button would
              // only produce an error the user could have been spared.
              disabled={!hasResume}
              isLoading={apply.isPending}
            >
              Submit application
            </Button>
          </div>
        </form>
      </Card>
    </Backdrop>
  );
};

const Backdrop = ({ onClose, children }) => (
  <div
    className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
    onClick={(event) => {
      // Backdrop click closes; a click inside must not bubble out and close it.
      if (event.target === event.currentTarget) onClose?.();
    }}
  >
    {children}
  </div>
);

export default ApplyDialog;
