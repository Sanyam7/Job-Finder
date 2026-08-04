import {
  APPLICATION_STATUS_META,
  JOB_STATUS_META,
  VERIFICATION_STATUS_META,
} from '@verihire/shared';
import { cn } from '../../utils/cn.js';

/**
 * Status badges.
 *
 * ★ The `tone` on every status comes from `shared/constants/statuses.js`, never from a
 * lookup table in the client. That is why the enum carries a tone at all: a rejected job and
 * a rejected company are red in the admin table, the employer dashboard and the audit log
 * because one file said so, not because three developers each picked red.
 */

const TONES = {
  neutral: 'bg-elevated text-muted border-border',
  info: 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-900/40 dark:text-brand-300 dark:border-brand-800',
  success:
    'bg-accent-50 text-accent-700 border-accent-300 dark:bg-accent-700/20 dark:text-accent-300 dark:border-accent-700',
  warning:
    'bg-warn-50 text-warn-600 border-warn-100 dark:bg-warn-500/15 dark:text-warn-500 dark:border-warn-600/40',
  danger:
    'bg-danger-50 text-danger-600 border-danger-100 dark:bg-danger-500/15 dark:text-danger-500 dark:border-danger-600/40',
};

const SIZES = {
  sm: 'text-[11px] px-1.5 py-0.5 gap-1',
  md: 'text-xs px-2 py-0.5 gap-1.5',
};

/**
 * @param {{tone?: 'neutral'|'info'|'success'|'warning'|'danger', size?: 'sm'|'md',
 *          dot?: boolean, className?: string, children?: React.ReactNode,
 *          title?: string}} props
 */
export const Badge = ({ tone = 'neutral', size = 'md', dot = false, className, children, ...props }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full border font-medium whitespace-nowrap',
      TONES[tone] ?? TONES.neutral,
      SIZES[size] ?? SIZES.md,
      className,
    )}
    {...props}
  >
    {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
    {children}
  </span>
);

/** @param {{status: string}} props */
export const JobStatusBadge = ({ status, ...props }) => {
  const meta = JOB_STATUS_META[status] ?? {};
  return (
    <Badge tone={meta.tone} dot {...props}>
      {meta.label ?? status}
    </Badge>
  );
};

/** @param {{status: string}} props */
export const ApplicationStatusBadge = ({ status, ...props }) => {
  const meta = APPLICATION_STATUS_META[status] ?? {};
  return (
    <Badge tone={meta.tone} dot {...props}>
      {meta.label ?? status}
    </Badge>
  );
};

/** @param {{status: string}} props */
export const VerificationBadge = ({ status, ...props }) => {
  const meta = VERIFICATION_STATUS_META[status] ?? {};
  return (
    <Badge tone={meta.tone} dot {...props}>
      {meta.label ?? status}
    </Badge>
  );
};

/**
 * ★ The verified-company mark — the single most important pixel in the product.
 *
 * Rendered ONLY from a server-provided `companySnapshot.isVerified`, which is written by the
 * same transaction that verifies the company. It is never inferred client-side from "this
 * job is visible, so the company must be verified": that inference is true today and would
 * become a lie the moment any other code path could publish a job.
 *
 * There is deliberately no "unverified" variant. An absent badge is the honest signal; a
 * grey "not verified" chip on every listing would train people to ignore the row entirely.
 */
/** @param {{size?: 'sm'|'md', withLabel?: boolean, className?: string}} props */
export const VerifiedMark = ({ size = 'md', withLabel = true, className }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 font-medium text-accent-600 dark:text-accent-300',
      size === 'sm' ? 'text-[11px]' : 'text-xs',
      className,
    )}
    title="This company's identity and documents were checked by our team"
  >
    <svg
      className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 1.5l2.09 1.52 2.58-.02.79 2.46 2.09 1.5-.8 2.46.8 2.46-2.09 1.5-.79 2.46-2.58-.02L10 18.5l-2.09-1.52-2.58.02-.79-2.46-2.09-1.5.8-2.46-.8-2.46 2.09-1.5.79-2.46 2.58.02L10 1.5zm3.36 6.14a.75.75 0 00-1.16-.95l-2.9 3.55-1.34-1.34a.75.75 0 10-1.06 1.06l1.93 1.93a.75.75 0 001.14-.08l3.39-4.17z"
        clipRule="evenodd"
      />
    </svg>
    {withLabel && 'Verified'}
    {!withLabel && <span className="sr-only">Verified company</span>}
  </span>
);

export default Badge;
