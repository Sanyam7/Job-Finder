import { LIMITS } from '@verihire/shared';
import { cn } from '../../utils/cn.js';

/**
 * Live password requirements.
 *
 * ★ Requirements rather than a strength meter. "Weak" tells someone their password is bad;
 * this tells them what to add. The checks are derived from the same `LIMITS` and the same
 * character classes `PATTERNS.PASSWORD` enforces server-side, so the list can never promise
 * something the API will reject.
 *
 * Hidden until the user types — greeting an empty field with four red crosses is telling
 * someone they have failed before they have done anything.
 *
 * @param {{value?: string}} props
 */
export const PasswordRules = ({ value = '' }) => {
  if (!value) return null;

  const rules = [
    {
      label: `${LIMITS.MIN_PASSWORD_LENGTH}+ characters`,
      met: value.length >= LIMITS.MIN_PASSWORD_LENGTH,
    },
    { label: 'Upper and lower case', met: /[a-z]/.test(value) && /[A-Z]/.test(value) },
    { label: 'A number', met: /\d/.test(value) },
    { label: 'A symbol', met: /[^A-Za-z0-9]/.test(value) },
  ];

  return (
    <ul className="-mt-1 flex flex-wrap gap-x-4 gap-y-1">
      {rules.map((rule) => (
        <li
          key={rule.label}
          className={cn('text-xs', rule.met ? 'text-accent-600 dark:text-accent-300' : 'text-muted')}
        >
          <span aria-hidden="true">{rule.met ? '✓' : '·'}</span> {rule.label}
          <span className="sr-only">{rule.met ? ' — met' : ' — still needed'}</span>
        </li>
      ))}
    </ul>
  );
};

export default PasswordRules;
