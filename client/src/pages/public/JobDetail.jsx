import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAppSelector } from '../../app/hooks.js';
import { ROLES } from '@verihire/shared';
import { publicApi } from '../../api/services/index.js';
import { JobCard } from '../../features/jobs/components/JobCard.jsx';
import { ApplyDialog } from '../../features/applications/ApplyDialog.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge, VerifiedMark } from '../../components/ui/Badge.jsx';
import { Alert, EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback.jsx';
import { Card } from '../../components/ui/Card.jsx';

/**
 * Public job detail.
 *
 * ★ A job that fails either gate 404s here, because the API returns 404 rather than 403 —
 * distinguishing "hidden" from "nonexistent" would let anyone confirm that a specific
 * pending or rejected listing exists.
 *
 * The verification story is told once, prominently, and never repeated as decoration. A
 * trust signal that appears six times on one page stops being read as information.
 */
export const JobDetail = () => {
  const { slug } = useParams();
  const [isApplyOpen, setApplyOpen] = useState(false);
  const user = useAppSelector((state) => state.auth.user);

  const { data: job, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['public', 'job', slug],
    queryFn: () => publicApi.getJob(slug),
  });

  const { data: similar } = useQuery({
    queryKey: ['public', 'job', slug, 'similar'],
    queryFn: () => publicApi.getSimilarJobs(slug),
    enabled: Boolean(job),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (isError) {
    // 404 is the expected outcome for a pulled listing, so it gets its own copy rather than
    // a generic error — "something went wrong" would be misleading and slightly alarming.
    const isGone = error?.status === 404;

    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        {isGone ? (
          <EmptyState
            title="This job is no longer available"
            description="It may have been filled, closed by the employer, or removed by our review team. There are other verified roles open right now."
            action={{ label: 'Browse jobs', onClick: () => window.location.assign('/jobs') }}
          />
        ) : (
          <ErrorState message={error?.message} requestId={error?.requestId} onRetry={refetch} />
        )}
      </div>
    );
  }

  const isExpired = job.deadline && new Date(job.deadline) < new Date();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav className="mb-4 text-sm text-muted">
        <Link to="/jobs" className="hover:text-ink">
          Jobs
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">{job.title}</span>
      </nav>

      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-ink sm:text-3xl">{job.title}</h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
              <Link
                to={`/companies/${job.company?.slug}`}
                className="font-medium text-ink hover:text-brand-500"
              >
                {job.company?.name}
              </Link>
              {job.company?.isVerified && <VerifiedMark />}
              <span aria-hidden="true">·</span>
              <span>{job.locationLabel}</span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            <ApplyButton
              job={job}
              user={user}
              isExpired={isExpired}
              onApply={() => setApplyOpen(true)}
            />
            {job.deadline && !isExpired && (
              <p className="text-xs text-muted">
                Closes {new Date(job.deadline).toLocaleDateString(undefined, { dateStyle: 'medium' })}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="neutral">{humanise(job.employmentType)}</Badge>
          <Badge tone="neutral">{humanise(job.workMode)}</Badge>
          <Badge tone="neutral">{job.experienceLabel}</Badge>
          <Badge tone={job.salary ? 'success' : 'neutral'}>{job.salaryLabel}</Badge>
          {job.openings > 1 && <Badge tone="info">{job.openings} openings</Badge>}
        </div>
      </header>

      {isExpired && (
        <Alert tone="warning" className="mb-6">
          The application deadline for this role has passed.
        </Alert>
      )}

      {/*
        ★ The trust explanation, stated once.
        It says what was actually checked, not "trusted employer" — a specific claim can be
        verified by the reader; a vague one is just marketing.
      */}
      <Alert tone="success" title="Why you can trust this listing" className="mb-6">
        Our team checked {job.company?.name}&apos;s registration documents and signatory ID
        before they could post, and a person read this listing before it went live.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="About the role">
            {/*
              Server-sanitised, but rendered as plain text with preserved line breaks rather
              than as HTML. There is no path from a job description to `dangerouslySetInnerHTML`
              anywhere in this codebase — a stored XSS on a page every candidate visits is not
              worth rich formatting.
            */}
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {job.description}
            </p>
          </Section>

          {job.responsibilities?.length > 0 && (
            <Section title="What you'll do">
              <BulletList items={job.responsibilities} />
            </Section>
          )}

          {job.requirements?.length > 0 && (
            <Section title="What we're looking for">
              <BulletList items={job.requirements} />
            </Section>
          )}

          {job.niceToHave?.length > 0 && (
            <Section title="Nice to have">
              <BulletList items={job.niceToHave} />
            </Section>
          )}

          {job.benefits?.length > 0 && (
            <Section title="Benefits">
              <BulletList items={job.benefits} />
            </Section>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Skills</h2>
            <div className="flex flex-wrap gap-1.5">
              {job.skillsRequired?.map((skill) => (
                <Badge key={skill.name} tone={skill.isMandatory ? 'info' : 'neutral'}>
                  {skill.name}
                </Badge>
              ))}
            </div>
            {job.skillsRequired?.some((s) => s.isMandatory) && (
              <p className="mt-2 text-xs text-muted">Highlighted skills are required.</p>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold">At a glance</h2>
            <dl className="space-y-2 text-sm">
              <Row label="Industry" value={job.industry} />
              <Row label="Department" value={job.department} />
              <Row label="Company size" value={job.companySize} />
              <Row label="Applicants" value={job.stats?.applications ?? 0} />
            </dl>
          </Card>

          {/*
            Reporting is available to everyone, signed in or not.
            The entire product is a bet that people will tell us when something is wrong;
            putting that behind a sign-up wall would lose most of the reports.
          */}
          <Card>
            <h2 className="mb-1 text-sm font-semibold">Something wrong with this listing?</h2>
            <p className="mb-3 text-xs text-muted">
              If it asks for money, looks misleading, or the company does not exist, tell us.
              We review every report.
            </p>
            <Button variant="secondary" size="sm" fullWidth>
              Report this job
            </Button>
          </Card>
        </aside>
      </div>

      {similar?.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Similar verified roles</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {similar.map((item) => (
              <JobCard key={item.id} job={item} compact />
            ))}
          </div>
        </section>
      )}

      {isApplyOpen && <ApplyDialog job={job} onClose={() => setApplyOpen(false)} />}
    </div>
  );
};

/**
 * ★ The apply button knows four states.
 *
 * A guest is asked to sign in *and told why*; an employer is told plainly that this is not
 * for them rather than being shown a button that 403s. Rendering one disabled button for all
 * of these is how a user concludes the site is broken.
 */
const ApplyButton = ({ job, user, isExpired, onApply }) => {
  if (isExpired) {
    return (
      <Button disabled size="lg">
        Applications closed
      </Button>
    );
  }

  if (!user) {
    return (
      <Link to={`/login?redirect=/jobs/${job.slug}`}>
        <Button size="lg">Sign in to apply</Button>
      </Link>
    );
  }

  if (user.role !== ROLES.CANDIDATE) {
    return (
      <Button disabled size="lg" title="Only candidate accounts can apply">
        Apply
      </Button>
    );
  }

  return (
    <Button size="lg" onClick={onApply}>
      Apply now
    </Button>
  );
};

const Section = ({ title, children }) => (
  <section>
    <h2 className="mb-2 text-lg font-semibold text-ink">{title}</h2>
    {children}
  </section>
);

const BulletList = ({ items }) => (
  <ul className="space-y-1.5">
    {items.map((item, index) => (
      <li key={index} className="flex gap-2 text-sm text-ink">
        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
        {item}
      </li>
    ))}
  </ul>
);

const Row = ({ label, value }) =>
  value ? (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  ) : null;

const humanise = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());

export default JobDetail;
