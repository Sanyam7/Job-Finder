import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ERROR_CODES } from '@verihire/shared';

import { forgotPasswordSchema } from '../../validations/auth.schema.js';
import { authApi } from '../../api/services/auth.api.js';
import { ROUTES } from '../../routes/paths.js';
import { AuthShell } from './AuthShell.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';

/**
 * Forgot password.
 *
 * ★ The success state is identical whether or not the address exists, because the server's
 * response is. Any difference here — different copy, a different delay, a field error —
 * re-opens the account-enumeration hole the endpoint was written to close, and on a job board
 * "does this person have an account" is information worth money to a recruiter scraping.
 *
 * The consequence is a screen that cannot tell someone they typed the wrong address. The
 * copy names that explicitly rather than leaving them to wonder why nothing arrived.
 */
export const ForgotPassword = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: yupResolver(forgotPasswordSchema), mode: 'onBlur' });

  const mutation = useMutation({
    // `email` is optional in the type yup infers even though the schema marks it required, so
    // the parameter matches what `handleSubmit` actually hands over.
    mutationFn: (/** @type {{email?: string}} */ vars) => authApi.forgotPassword(vars.email),
  });

  if (mutation.isSuccess) {
    return (
      <AuthShell
        title="Check your email"
        footer={
          <Link to={ROUTES.LOGIN} className="font-medium text-brand-500 hover:underline">
            Back to sign in
          </Link>
        }
      >
        <Alert tone="success" title="If that address has an account, a reset link is on its way">
          <p>
            The link works once and expires in an hour. If nothing arrives in a few minutes,
            check spam — and check the address you entered, since we cannot confirm whether it
            is registered.
          </p>
        </Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter the email on your account and we'll send you a link."
      footer={
        <>
          Remembered it?{' '}
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
        <Input
          label="Email address"
          type="email"
          required
          autoComplete="email"
          autoFocus
          error={errors.email?.message}
          {...register('email')}
        />

        {mutation.isError && (
          <Alert tone="danger">
            {mutation.error?.code === ERROR_CODES.TOO_MANY_REQUESTS
              ? 'Too many reset requests from this address. Try again in a few minutes.'
              : mutation.error?.message}
          </Alert>
        )}

        <Button type="submit" fullWidth isLoading={isSubmitting || mutation.isPending}>
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
};

export default ForgotPassword;
