import { forwardRef, useId } from 'react';
import { cn } from '../../utils/cn.js';

/**
 * Form fields.
 *
 * ★ The error is wired with `aria-describedby` and `aria-invalid`, not just painted red. A
 * red border is invisible to a screen reader and ambiguous to the ~8% of men with a colour
 * vision deficiency — on a form that decides whether someone can apply for a job, "the field
 * is red" is not an acceptable sole signal.
 *
 * The message slot keeps its height whether or not there is an error, so validating a form
 * does not shunt every field below it down the page while the user is typing.
 */

const baseField = cn(
  'w-full rounded-md border bg-surface px-3 text-ink',
  'placeholder:text-muted/70',
  'transition-colors duration-150',
  'disabled:cursor-not-allowed disabled:bg-elevated disabled:opacity-60',
);

const stateClasses = (hasError) =>
  hasError
    ? 'border-danger-500 focus-visible:ring-danger-500'
    : 'border-border hover:border-muted/50';

/**
 * Fields shared by every control here.
 *
 * `error` accepts react-hook-form's `FieldError` object as well as a plain string. RHF hands
 * components `{ message, type, ref }`, not a string, so a component that renders `error`
 * directly prints `[object Object]` into the form — a real bug this widening plus
 * `errorText()` below prevents, not merely a type accommodation.
 *
 * @typedef {object} FieldProps
 * @property {React.ReactNode} [label]
 * @property {string|{message?: any}} [error]
 * @property {React.ReactNode} [hint]
 * @property {boolean} [required]
 */

/**
 * Pulls a displayable string out of whatever the caller passed as `error`.
 *
 * @param {string|{message?: any}|null|undefined} error
 * @returns {string|undefined}
 */
const errorText = (error) => {
  if (typeof error === 'string') return error || undefined;
  const message = error?.message;
  return typeof message === 'string' ? message || undefined : undefined;
};

export const Input = forwardRef(
  /**
   * @param {FieldProps & {leftAddon?: React.ReactNode, rightAddon?: React.ReactNode} &
   *         React.InputHTMLAttributes<HTMLInputElement>} props
   * @param {React.Ref<HTMLInputElement>} ref
   */
  (
    { label, error: rawError, hint, required, leftAddon, rightAddon, className, id, ...props },
    ref,
  ) => {
    const error = errorText(rawError);
    const autoId = useId();
    const fieldId = id ?? autoId;
    const messageId = `${fieldId}-message`;

    return (
      <div className="w-full">
        {label && (
          <Label htmlFor={fieldId} required={required}>
            {label}
          </Label>
        )}

        <div className="relative">
          {leftAddon && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              {leftAddon}
            </span>
          )}

          <input
            ref={ref}
            id={fieldId}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error || hint ? messageId : undefined}
            aria-required={required || undefined}
            className={cn(
              baseField,
              'h-10 text-sm',
              stateClasses(Boolean(error)),
              leftAddon && 'pl-9',
              rightAddon && 'pr-10',
              className,
            )}
            {...props}
          />

          {rightAddon && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2">{rightAddon}</span>
          )}
        </div>

        <FieldMessage id={messageId} error={error} hint={hint} />
      </div>
    );
  },
);

Input.displayName = 'Input';

export const Textarea = forwardRef(
  /**
   * @param {FieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>} props
   * @param {React.Ref<HTMLTextAreaElement>} ref
   */
  ({ label, error: rawError, hint, required, maxLength, value, className, id, ...props }, ref) => {
    const error = errorText(rawError);
    const autoId = useId();
    const fieldId = id ?? autoId;
    const messageId = `${fieldId}-message`;
    const length = String(value ?? '').length;

    return (
      <div className="w-full">
        {label && (
          <Label htmlFor={fieldId} required={required}>
            {label}
          </Label>
        )}

        <textarea
          ref={ref}
          id={fieldId}
          value={value}
          maxLength={maxLength}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={cn(baseField, 'min-h-[120px] py-2 text-sm', stateClasses(Boolean(error)), className)}
          {...props}
        />

        <div className="flex items-start justify-between gap-3">
          <FieldMessage id={messageId} error={error} hint={hint} />

          {maxLength && (
            <span
              className={cn(
                'mt-1 shrink-0 text-xs tabular-nums',
                // Warn before they hit the wall, not at it: discovering a limit by having
                // your last sentence silently refused is worse than seeing it approach.
                length > maxLength * 0.9 ? 'text-warn-600' : 'text-muted',
              )}
            >
              {length}/{maxLength}
            </span>
          )}
        </div>
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';

export const Select = forwardRef(
  /**
   * @param {FieldProps & {options?: Array<{value: string|number, label: string}>,
   *         placeholder?: string} & React.SelectHTMLAttributes<HTMLSelectElement>} props
   * @param {React.Ref<HTMLSelectElement>} ref
   */
  ({ label, error: rawError, hint, required, options = [], placeholder, className, id, ...props }, ref) => {
    const error = errorText(rawError);
    const autoId = useId();
    const fieldId = id ?? autoId;
    const messageId = `${fieldId}-message`;

    return (
      <div className="w-full">
        {label && (
          <Label htmlFor={fieldId} required={required}>
            {label}
          </Label>
        )}

        <select
          ref={ref}
          id={fieldId}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={cn(baseField, 'h-10 text-sm', stateClasses(Boolean(error)), className)}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <FieldMessage id={messageId} error={error} hint={hint} />
      </div>
    );
  },
);

Select.displayName = 'Select';

/**
 * @param {{htmlFor?: string, required?: boolean, children?: React.ReactNode,
 *          className?: string}} props
 */
export const Label = ({ htmlFor, required, children, className }) => (
  <label htmlFor={htmlFor} className={cn('mb-1.5 block text-sm font-medium text-ink', className)}>
    {children}
    {required && (
      <span className="ml-0.5 text-danger-500" aria-hidden="true">
        *
      </span>
    )}
  </label>
);

/**
 * The message slot.
 *
 * `role="alert"` so the error is announced when it appears — a user who submits a form and
 * hears nothing has no way to know why the page did not move on.
 */
/** @param {{id?: string, error?: string, hint?: React.ReactNode}} props */
const FieldMessage = ({ id, error, hint }) => (
  <p
    id={id}
    role={error ? 'alert' : undefined}
    className={cn('mt-1 min-h-[1rem] text-xs', error ? 'text-danger-500' : 'text-muted')}
  >
    {error || hint || ' '}
  </p>
);

export const Checkbox = forwardRef(
  /**
   * @param {{label?: React.ReactNode, description?: React.ReactNode,
   *         error?: string|{message?: any}} &
   *         React.InputHTMLAttributes<HTMLInputElement>} props
   * @param {React.Ref<HTMLInputElement>} ref
   */
  ({ label, description, error: rawError, className, id, ...props }, ref) => {
    const error = errorText(rawError);
    const autoId = useId();
    const fieldId = id ?? autoId;

    return (
      <div className={cn('flex gap-3', className)}>
        <input
          ref={ref}
          id={fieldId}
          type="checkbox"
          aria-invalid={error ? 'true' : undefined}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-brand-500 focus-visible:ring-brand-500"
          {...props}
        />
        <div className="min-w-0">
          <label htmlFor={fieldId} className="cursor-pointer text-sm text-ink">
            {label}
          </label>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          {error && (
            <p role="alert" className="mt-0.5 text-xs text-danger-500">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  },
);

Checkbox.displayName = 'Checkbox';

export default Input;
