import { cn } from '../../utils/cn.js';
import { Button } from './Button.jsx';

/**
 * Empty, error and loading states.
 *
 * ★ These exist as first-class components because they are where products are actually
 * judged. A candidate whose search returns nothing sees this screen, not the beautiful
 * results grid — and "No results" with no suggested next action is how someone decides the
 * board is empty and leaves.
 *
 * Every empty state here takes an `action`. If a caller cannot think of one, that is a
 * signal the screen has a dead end in it.
 */

/**
 * @param {{icon?: React.ReactNode, title: React.ReactNode, description?: React.ReactNode,
 *          action?: {label: string, onClick: () => void},
 *          secondaryAction?: {label: string, onClick: () => void},
 *          size?: 'sm'|'md'}} props
 */
export const EmptyState = ({ icon, title, description, action, secondaryAction, size = 'md' }) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center rounded-lg border border-dashed border-border text-center',
      size === 'sm' ? 'gap-2 p-6' : 'gap-3 p-12',
    )}
  >
    {icon && <div className="text-muted">{icon}</div>}
    <h3 className={cn('font-semibold text-ink', size === 'sm' ? 'text-sm' : 'text-base')}>
      {title}
    </h3>
    {description && <p className="max-w-md text-sm text-muted">{description}</p>}

    {(action || secondaryAction) && (
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {action && (
          <Button size={size === 'sm' ? 'sm' : 'md'} onClick={action.onClick}>
            {action.label}
          </Button>
        )}
        {secondaryAction && (
          <Button variant="ghost" size={size === 'sm' ? 'sm' : 'md'} onClick={secondaryAction.onClick}>
            {secondaryAction.label}
          </Button>
        )}
      </div>
    )}
  </div>
);

/**
 * ★ The error state.
 *
 * Shows the server's `requestId` when there is one. That single string turns "the site is
 * broken" into a log line an engineer can find in seconds, and it costs the user nothing to
 * copy into a support message.
 *
 * @param {{title?: React.ReactNode, message?: React.ReactNode, requestId?: string|null,
 *          onRetry?: () => void}} props
 */
export const ErrorState = ({
  title = 'Something went wrong',
  message = 'Please try again. If it keeps happening, let us know.',
  requestId,
  onRetry,
}) => (
  <div
    role="alert"
    className="flex flex-col items-center justify-center gap-3 rounded-lg border border-danger-100 bg-danger-50 p-8 text-center dark:border-danger-600/40 dark:bg-danger-500/10"
  >
    <svg
      className="h-8 w-8 text-danger-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
    </svg>

    <h3 className="text-base font-semibold text-ink">{title}</h3>
    <p className="max-w-md text-sm text-muted">{message}</p>

    {requestId && (
      <code className="rounded bg-surface px-2 py-1 font-mono text-[11px] text-muted">
        Reference: {requestId}
      </code>
    )}

    {onRetry && (
      <Button variant="secondary" size="sm" onClick={onRetry} className="mt-1">
        Try again
      </Button>
    )}
  </div>
);

/**
 * Inline alert.
 * @param {{tone?: 'info'|'success'|'warning'|'danger', title?: React.ReactNode,
 *          children?: React.ReactNode, action?: React.ReactNode,
 *          className?: string}} props
 */
export const Alert = ({ tone = 'info', title, children, action, className }) => {
  const TONES = {
    info: 'border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100',
    success:
      'border-accent-300 bg-accent-50 text-accent-700 dark:border-accent-700 dark:bg-accent-700/15 dark:text-accent-100',
    warning:
      'border-warn-100 bg-warn-50 text-warn-600 dark:border-warn-600/40 dark:bg-warn-500/10 dark:text-warn-500',
    danger:
      'border-danger-100 bg-danger-50 text-danger-600 dark:border-danger-600/40 dark:bg-danger-500/10 dark:text-danger-500',
  };

  return (
    <div
      // Only the two states a user must not miss interrupt a screen reader.
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn('rounded-md border p-3 text-sm', TONES[tone] ?? TONES.info, className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
};

/**
 * Skeleton loader.
 *
 * ★ Matches the shape of what is coming, not a generic grey box. A skeleton whose layout
 * differs from the loaded content produces a visible jump on every load, which reads as
 * jank however fast the request was.
 */
/** @param {{className?: string}} props */
export const Skeleton = ({ className }) => (
  <div className={cn('skeleton h-4 w-full', className)} aria-hidden="true" />
);

export const JobCardSkeleton = () => (
  <div className="card space-y-3 p-4">
    <div className="flex items-start gap-3">
      <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
    <div className="flex gap-2">
      <Skeleton className="h-5 w-16 rounded-full" />
      <Skeleton className="h-5 w-20 rounded-full" />
      <Skeleton className="h-5 w-14 rounded-full" />
    </div>
    <Skeleton className="h-3 w-1/3" />
  </div>
);

/**
 * @param {{rows?: number, columns?: number}} props
 */
export const TableSkeleton = ({ rows = 5, columns = 4 }) => (
  <div className="card divide-y divide-border">
    {Array.from({ length: rows }, (_, rowIndex) => (
      <div key={rowIndex} className="flex items-center gap-4 p-4">
        {Array.from({ length: columns }, (_, colIndex) => (
          <Skeleton
            key={colIndex}
            className={cn('h-4', colIndex === 0 ? 'w-1/3' : 'flex-1')}
          />
        ))}
      </div>
    ))}
  </div>
);

/**
 * A live region for status text that changes without a navigation.
 *
 * `aria-live="polite"` waits for a pause rather than interrupting, which is right for
 * "3 jobs found" and wrong for an error — errors use `role="alert"` above.
 */
/** @param {{children?: React.ReactNode}} props */
export const LiveStatus = ({ children }) => (
  <p aria-live="polite" className="sr-only">
    {children}
  </p>
);

export default EmptyState;
