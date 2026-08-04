import { forwardRef } from 'react';
import { cn } from '../../utils/cn.js';

/**
 * Surfaces and layout primitives.
 *
 * `interactive` renders a real `<button>` wrapper rather than an `onClick` on a `<div>`.
 * A clickable div is not focusable, does not respond to Enter or Space, and is invisible to
 * a screen reader as an action — on a job board that means the whole results list is
 * unusable from a keyboard.
 */

/**
 * Ref-forwarding, because dialogs built on `Card` need to move focus into themselves on
 * open — without that a keyboard user's focus stays behind the modal on the page they can
 * no longer see.
 */
export const Card = forwardRef(
  /**
   * @param {{as?: any, padded?: boolean, className?: string, children?: React.ReactNode} &
   *         React.HTMLAttributes<HTMLElement>} props
   * @param {React.Ref<any>} ref
   */
  ({ as: Component = 'div', padded = true, className, children, ...props }, ref) => (
    <Component ref={ref} className={cn('card', padded && 'p-4', className)} {...props}>
      {children}
    </Component>
  ),
);

Card.displayName = 'Card';

/**
 * @param {{title: React.ReactNode, description?: React.ReactNode, action?: React.ReactNode,
 *          className?: string}} props
 */
export const CardHeader = ({ title, description, action, className }) => (
  <div className={cn('flex items-start justify-between gap-4', className)}>
    <div className="min-w-0">
      <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/**
 * @param {{onClick: () => void, ariaLabel: string, className?: string,
 *          children?: React.ReactNode}} props
 */
export const InteractiveCard = ({ onClick, ariaLabel, className, children }) => (
  <div
    className={cn(
      'card group relative transition-shadow duration-150 hover:shadow-[var(--shadow-md)]',
      'focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-2 focus-within:ring-offset-bg',
      className,
    )}
  >
    {/*
      A stretched, invisible button covers the card so the whole surface is clickable while
      the accessible element is still a button. Links inside the card sit above it via
      `relative z-10`, so "apply" does not get swallowed by "open the job".
    */}
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="absolute inset-0 z-0 rounded-lg focus:outline-none"
    />
    {children}
  </div>
);

/**
 * A labelled statistic.
 * @param {{label: string, value: React.ReactNode, hint?: React.ReactNode,
 *          tone?: 'neutral'|'success'|'warning'|'danger'|'brand',
 *          icon?: React.ReactNode}} props
 */
export const StatCard = ({ label, value, hint, tone = 'neutral', icon }) => {
  const TONES = {
    neutral: 'text-ink',
    success: 'text-accent-600 dark:text-accent-300',
    warning: 'text-warn-600',
    danger: 'text-danger-500',
    brand: 'text-brand-500',
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted">{label}</p>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      {/* `tabular-nums` so a counter ticking up does not shift the layout each time. */}
      <p className={cn('mt-1 text-2xl font-bold tabular-nums', TONES[tone] ?? TONES.neutral)}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
};

/**
 * Page heading with breadcrumb slot and actions.
 *
 * @param {{title: React.ReactNode, description?: React.ReactNode,
 *          breadcrumb?: React.ReactNode, actions?: React.ReactNode, className?: string}} props
 */
export const PageHeader = ({ title, description, breadcrumb, actions, className }) => (
  <header className={cn('mb-6', className)}>
    {breadcrumb && <div className="mb-2 text-sm text-muted">{breadcrumb}</div>}
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  </header>
);

/**
 * Responsive data table.
 *
 * Wrapped in a horizontal scroller rather than collapsing columns on narrow screens: an
 * admin comparing companies needs every column, and a table that silently hides the one they
 * are looking for is worse than one they have to scroll.
 */
/** @param {{className?: string, children?: React.ReactNode}} props */
export const TableWrap = ({ className, children }) => (
  <div className={cn('card overflow-hidden', className)}>
    <div className="overflow-x-auto">{children}</div>
  </div>
);

/** @param {React.ThHTMLAttributes<HTMLTableCellElement>} props */
export const Th = ({ className, children, ...props }) => (
  <th
    scope="col"
    className={cn(
      'whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted',
      className,
    )}
    {...props}
  >
    {children}
  </th>
);

/** @param {React.TdHTMLAttributes<HTMLTableCellElement>} props */
export const Td = ({ className, children, ...props }) => (
  <td className={cn('px-4 py-3 text-sm text-ink', className)} {...props}>
    {children}
  </td>
);

export default Card;
