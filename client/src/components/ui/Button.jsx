import { forwardRef } from 'react';
import { cn } from '../../utils/cn.js';

/**
 * The button.
 *
 * ★ `isLoading` disables the button as well as showing a spinner. A spinner that leaves the
 * button clickable is the single most common source of duplicate submissions — two
 * applications, two job posts, two payment attempts — and every one of those is a bug the
 * user cannot undo.
 *
 * The label stays mounted and is hidden with `opacity-0` rather than replaced, so the button
 * does not resize mid-click and move the thing next to it under the user's cursor.
 */

const VARIANTS = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 disabled:hover:bg-brand-500',
  secondary:
    'bg-surface text-ink border border-border hover:bg-elevated active:bg-elevated',
  ghost: 'bg-transparent text-ink hover:bg-elevated active:bg-elevated',
  danger: 'bg-danger-500 text-white hover:bg-danger-600 disabled:hover:bg-danger-500',
  /** Reserved for the verification actions — the trust colour is never decorative. */
  success: 'bg-accent-600 text-white hover:bg-accent-700 disabled:hover:bg-accent-600',
  link: 'bg-transparent text-brand-500 underline-offset-4 hover:underline p-0 h-auto',
};

const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-10 w-10 p-0',
};

/**
 * ★ Props are declared rather than left to inference, and that is what makes `checkJs`
 * usable across the app. TypeScript infers a component's props from its destructuring
 * pattern and marks every one of them **required** — so an unannotated `Button` makes
 * `<Button>Save</Button>` an error for omitting `className`. A `forwardRef` component with no
 * annotation is worse: it types as `RefAttributes<any>` carrying no props at all, so every
 * attribute on every call site errors.
 *
 * The annotation goes on the *render function's* parameters, not on the exported const.
 * Annotating the const with `@type {ForwardRefExoticComponent<…>}` types the call sites
 * correctly but detaches the inner destructure, which then infers as `{}` and breaks the
 * implementation instead. Annotating the parameters lets `forwardRef` infer both.
 *
 * @typedef {object} ButtonOwnProps
 * @property {'primary'|'secondary'|'ghost'|'danger'|'success'|'link'} [variant]
 * @property {'sm'|'md'|'lg'|'icon'} [size]
 * @property {boolean} [isLoading]
 * @property {React.ReactNode} [leftIcon]
 * @property {React.ReactNode} [rightIcon]
 * @property {boolean} [fullWidth]
 */
export const Button = forwardRef(
  /**
   * @param {ButtonOwnProps & React.ButtonHTMLAttributes<HTMLButtonElement>} props
   * @param {React.Ref<HTMLButtonElement>} ref
   */
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className,
      children,
      type = 'button',
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      // Explicit: an un-typed button inside a form defaults to submit, which silently
      // submits the form when someone clicks "Cancel".
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        'relative inline-flex items-center justify-center rounded-md font-medium',
        'transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {isLoading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      )}
      <span className={cn('inline-flex items-center gap-2', isLoading && 'opacity-0')}>
        {leftIcon}
        {children}
        {rightIcon}
      </span>
    </button>
  ),
);

Button.displayName = 'Button';

const Spinner = () => (
  <svg
    className="h-4 w-4 animate-spin"
    viewBox="0 0 24 24"
    fill="none"
    // Decorative: `aria-busy` on the button already announces the state, and a second
    // announcement makes screen readers say it twice.
    aria-hidden="true"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

export default Button;
