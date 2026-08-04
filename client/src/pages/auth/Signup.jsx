import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ERROR_CODES, PATTERNS, ROLES, isFreeEmailDomain } from '@verihire/shared';

import { signupSchema } from '../../validations/auth.schema.js';
import { authApi } from '../../api/services/auth.api.js';
import { ROUTES } from '../../routes/paths.js';
import { AuthShell } from './AuthShell.jsx';
import { Input, Checkbox } from '../../components/ui/Input.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { PasswordRules } from '../../features/auth/PasswordRules.jsx';
import { cn } from '../../utils/cn.js';

/**
 * Sign-up.
 *
 * ★ Role is chosen here and is immutable afterwards — the server refuses to change it, since
 * a candidate who becomes an employer would carry their application history into a hiring
 * account. Because it cannot be undone, it is presented as two deliberate cards rather than a
 * dropdown that is easy to leave on its default.
 *
 * ★ The employer card states the verification requirement BEFORE the account is created.
 * Discovering "you must upload incorporation documents and wait for a human" after signing up
 * is how you collect abandoned accounts and support tickets. Some employers will leave at this
 * screen; that is the correct outcome for a platform whose promise is that every listed
 * company was checked.
 */
export const Signup = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(signupSchema),
    mode: 'onBlur',
    defaultValues: {
      // Deep-linkable: "Hiring? Get started" on the marketing page arrives as ?role=EMPLOYER
      // with the right card already chosen.
      role: searchParams.get('role') === ROLES.EMPLOYER ? ROLES.EMPLOYER : ROLES.CANDIDATE,
      acceptedTerms: false,
    },
  });

  const role = watch('role');
  const password = watch('password') ?? '';
  const email = watch('email') ?? '';

  const mutation = useMutation({
    mutationFn: authApi.register,
    /*
     * No tokens come back and none are wanted: the server returns 201 without a session so an
     * unverified address can never hold one. We hand the email forward in router state so the
     * next screen can offer "resend" without asking them to type it again.
     */
    onSuccess: (_data, variables) =>
      navigate(ROUTES.VERIFY_EMAIL, { replace: true, state: { email: variables.email } }),
    onError: (error) => {
      if (error.code === ERROR_CODES.EMAIL_ALREADY_EXISTS) {
        setError('email', { message: 'An account already exists with this email.' });
        return;
      }
      if (error.code === ERROR_CODES.VALIDATION_ERROR && Array.isArray(error.details)) {
        // Server-supplied field names are plain strings; see the note in Login.jsx.
        error.details.forEach(({ field, message }) =>
          setError(/** @type {any} */ (field), { message }),
        );
        return;
      }
      setError('root', { message: error.message });
    },
  });

  const isEmployer = role === ROLES.EMPLOYER;

  return (
    <AuthShell
      width="md"
      title="Create your account"
      description="Every company on VeriHire is checked by a person before its jobs appear."
      footer={
        <>
          Already have an account?{' '}
          <Link to={ROUTES.LOGIN} className="font-medium text-brand-500 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="space-y-5"
        noValidate
      >
        {/*
          A radiogroup, not a pair of buttons: arrow keys move between options and the group
          announces "1 of 2" — the behaviour a screen-reader user expects from a choice like
          this one.
        */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">I am here to</legend>
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Account type">
            <RoleCard
              selected={!isEmployer}
              title="Find a job"
              body="Apply to verified companies. Free, always."
              onSelect={() => setValue('role', ROLES.CANDIDATE, { shouldValidate: true })}
            />
            <RoleCard
              selected={isEmployer}
              title="Hire people"
              body="Post roles once your company is verified."
              onSelect={() => setValue('role', ROLES.EMPLOYER, { shouldValidate: true })}
            />
          </div>
          <input type="hidden" {...register('role')} />
          {errors.role && (
            <p role="alert" className="mt-1.5 text-xs text-danger-500">
              {errors.role.message}
            </p>
          )}
          <p className="mt-1.5 text-xs text-muted">
            This cannot be changed later — the two account types keep separate histories.
          </p>
        </fieldset>

        {/* ★ Said before the account exists, not after. */}
        {isEmployer && (
          <Alert tone="info" title="What verification involves">
            You will be asked for your certificate of incorporation and a signatory ID, and an
            admin reviews them by hand — usually within 24–48 hours. Your listings stay private
            until that is done.
          </Alert>
        )}

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Input
            label="First name"
            required
            autoComplete="given-name"
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <Input
            label="Last name"
            required
            autoComplete="family-name"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>

        {isEmployer && (
          <Input
            label="Company name"
            required
            autoComplete="organization"
            hint="As it appears on your registration documents."
            error={errors.companyName?.message}
            {...register('companyName')}
          />
        )}

        <Input
          label="Work email"
          type="email"
          required
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        {/*
          A hint, not a rule. A company email speeds verification up because the domain can be
          matched against the website, but plenty of legitimate small companies run on Gmail
          and blocking them at sign-up would be wrong.
        */}
        {isEmployer && email && PATTERNS.EMAIL.test(email) && isFreeEmailDomain(email) && (
          <p className="-mt-3 text-xs text-warn-600">
            A company-domain address gets verified faster — we can match it against your website
            automatically. This one still works.
          </p>
        )}

        <div>
          <Input
            label="Password"
            type="password"
            required
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          {/*
            Live requirements instead of a strength bar. "Weak" tells someone their password is
            bad; this tells them what to add — and it is derived from the same PATTERNS.PASSWORD
            and LIMITS the server enforces, so it cannot promise something the API rejects.
          */}
          <PasswordRules value={password} />
        </div>

        <Input
          label="Confirm password"
          type="password"
          required
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Checkbox
          label="I agree to the terms of service and privacy policy"
          error={errors.acceptedTerms?.message}
          {...register('acceptedTerms')}
        />

        {errors.root && <Alert tone="danger">{errors.root.message}</Alert>}

        <Button type="submit" fullWidth isLoading={isSubmitting || mutation.isPending}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
};

/** @param {{selected: boolean, title: string, body: string, onSelect: () => void}} props */
const RoleCard = ({ selected, title, body, onSelect }) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    onClick={onSelect}
    className={cn(
      'rounded-lg border p-3 text-left transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
      selected
        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30'
        : 'border-border bg-surface hover:border-muted/50',
    )}
  >
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={cn(
          'grid h-4 w-4 shrink-0 place-items-center rounded-full border',
          selected ? 'border-brand-500' : 'border-border',
        )}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-brand-500" />}
      </span>
      <span className="font-medium text-ink">{title}</span>
    </span>
    <span className="mt-1 block pl-6 text-xs text-muted">{body}</span>
  </button>
);

export default Signup;
