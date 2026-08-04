import { Link } from 'react-router-dom';
import { Badge, VerifiedMark } from '../../../components/ui/Badge.jsx';
import { cn } from '../../../utils/cn.js';

/**
 * ★ The job card — the unit the whole product is judged by.
 *
 * Two decisions here carry the USP:
 *
 *  1. **The verified mark comes from `job.company.isVerified`**, written by the same
 *     transaction that verified the company. It is never inferred from "this job is in a
 *     public list, so the company must be verified". That inference is true today and would
 *     become a lie the moment any other code path could publish a listing.
 *
 *  2. **There is no "unverified" chip.** Every card in a public list is from a verified
 *     company by construction, so a grey "not verified" badge would be noise that trains
 *     people to ignore the mark entirely.
 */

/**
 * @param {{job: any, isSaved?: boolean, hasApplied?: boolean,
 *          onToggleSave?: (jobId: string) => void, compact?: boolean}} props
 */
export const JobCard = ({ job, isSaved = false, hasApplied = false, onToggleSave, compact }) => {
  if (!job) return null;

  return (
    <article
      className={cn(
        'card group relative transition-shadow duration-150',
        'hover:shadow-[var(--shadow-md)]',
        'focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-2 focus-within:ring-offset-bg',
        compact ? 'p-3' : 'p-4',
      )}
    >
      <div className="flex items-start gap-3">
        <CompanyLogo name={job.company?.name} logo={job.company?.logo} />

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-ink">
            {/*
              `after:absolute after:inset-0` stretches the link over the whole card, so the
              accessible element is a real link with a real href — middle-click, "open in new
              tab" and keyboard focus all work, which a div with onClick breaks.
            */}
            <Link
              to={`/jobs/${job.slug}`}
              className="after:absolute after:inset-0 after:rounded-lg hover:text-brand-500 focus:outline-none"
            >
              {job.title}
            </Link>
          </h3>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span className="truncate">{job.company?.name}</span>
            {job.company?.isVerified && <VerifiedMark size="sm" withLabel={false} />}
            <span aria-hidden="true">·</span>
            <span className="truncate">{job.locationLabel}</span>
          </div>
        </div>

        {onToggleSave && (
          <SaveButton
            isSaved={isSaved}
            jobTitle={job.title}
            // `relative z-10` lifts it above the stretched link, so saving does not navigate.
            onClick={() => onToggleSave(job.id)}
          />
        )}
      </div>

      {!compact && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone="neutral">{formatEnum(job.employmentType)}</Badge>
          <Badge tone="neutral">{formatEnum(job.workMode)}</Badge>
          {job.experienceLabel && <Badge tone="neutral">{job.experienceLabel}</Badge>}
          {job.skills?.slice(0, 3).map((skill) => (
            <Badge key={skill} tone="info">
              {skill}
            </Badge>
          ))}
          {job.skillCount > 3 && <Badge tone="neutral">+{job.skillCount - 3}</Badge>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className={cn('font-medium', job.salary ? 'text-ink' : 'text-muted')}>
          {job.salaryLabel}
        </span>

        <div className="flex items-center gap-3 text-xs text-muted">
          {hasApplied && (
            <Badge tone="success" size="sm">
              Applied
            </Badge>
          )}
          {job.applicantCount > 0 && <span>{job.applicantCount} applicant(s)</span>}
          <DeadlineNote deadline={job.deadline} />
        </div>
      </div>
    </article>
  );
};

/**
 * Initial-based fallback rather than a generic placeholder image.
 *
 * A verified company that has not uploaded a logo is common and completely legitimate; a
 * broken-image icon on their listing reads as a broken or low-quality posting.
 */
const CompanyLogo = ({ name, logo }) =>
  logo ? (
    <img
      src={logo}
      alt=""
      loading="lazy"
      className="h-10 w-10 shrink-0 rounded-md border border-border object-contain bg-surface"
    />
  ) : (
    <div
      aria-hidden="true"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border bg-elevated text-sm font-semibold text-muted"
    >
      {String(name ?? '?').charAt(0).toUpperCase()}
    </div>
  );

const SaveButton = ({ isSaved, jobTitle, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    // The label states the action AND the subject: a screen reader user hearing "Save"
    // twenty times in a list has no idea which job each button belongs to.
    aria-label={`${isSaved ? 'Remove' : 'Save'} ${jobTitle}`}
    aria-pressed={isSaved}
    className={cn(
      'relative z-10 shrink-0 rounded-md p-1.5 transition-colors',
      isSaved ? 'text-brand-500' : 'text-muted hover:text-ink',
    )}
  >
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill={isSaved ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" strokeLinejoin="round" />
    </svg>
  </button>
);

/**
 * ★ Urgency, but honestly.
 *
 * Only turns amber inside three days, and never invents pressure ("2 people viewing now!").
 * A platform whose pitch is that its listings are real should not use the dark patterns that
 * make the rest of the category feel untrustworthy.
 */
const DeadlineNote = ({ deadline }) => {
  if (!deadline) return null;

  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (days > 7) return null;
  if (days < 0) return <span className="text-muted">Closed</span>;

  return (
    <span className={days <= 3 ? 'font-medium text-warn-600' : 'text-muted'}>
      {days === 0 ? 'Closes today' : `${days} day${days === 1 ? '' : 's'} left`}
    </span>
  );
};

/** `FULL_TIME` → `Full time`. Enum values are a contract; their display form is not. */
const formatEnum = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());

export default JobCard;
