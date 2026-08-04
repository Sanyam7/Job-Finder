import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useDispatch } from 'react-redux';
import { useMutation } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ERROR_CODES } from '@verihire/shared';

import { loginSchema } from '../../validations/auth.schema.js';
import { authApi } from '../../api/services/auth.api.js';
import { setCredentials } from '../../features/auth/slices/authSlice.js';
import { ROUTES, homeForRole } from '../../routes/paths.js';

const SESSION_MESSAGES = {
  session_expired: 'Your session expired. Please sign in again.',
  session_revoked: 'We ended your session for security reasons. Please sign in again.',
  // A reset revokes every session by design, so arriving here is the expected outcome and
  // should read as success rather than as another thing that went wrong.
  password_reset: 'Your password was changed. Sign in with your new one.',
};

export const Login = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const notice = SESSION_MESSAGES[searchParams.get('reason')];

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: yupResolver(loginSchema), mode: 'onBlur' });

  const mutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: ({ user, accessToken }) => {
      dispatch(setCredentials({ user, accessToken }));
      // Return them to whatever they were trying to reach before the guard intervened.
      const target = location.state?.from?.pathname ?? homeForRole(user.role);
      navigate(target, { replace: true });
    },
    onError: (error) => {
      /**
       * Map server-side field errors back onto the inputs so they render inline, rather
       * than as a generic banner the user has to reconcile with the form themselves.
       */
      if (error.code === ERROR_CODES.VALIDATION_ERROR && Array.isArray(error.details)) {
        // `field` is whatever the server named; react-hook-form types `setError` against the
        // form's own key union, which cannot be known from a network response.
        error.details.forEach(({ field, message }) =>
          setError(/** @type {any} */ (field), { message }),
        );
        return;
      }
      setError('root', { message: error.message });
    },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Welcome back.</p>

      {notice && (
        <div
          role="status"
          className="mt-6 rounded-md border border-warn-500/30 bg-warn-50 px-4 py-3 text-sm text-warn-600 dark:bg-warn-500/10"
        >
          {notice}
        </div>
      )}

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="mt-8 space-y-5" noValidate>
        <Field label="Email" error={errors.email?.message} htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2.5 outline-none focus:border-brand-500"
          />
        </Field>

        <Field label="Password" error={errors.password?.message} htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            {...register('password')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2.5 outline-none focus:border-brand-500"
          />
        </Field>

        {errors.root && (
          <p role="alert" className="text-sm text-danger-500">
            {errors.root.message}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || mutation.isPending}
          className="w-full rounded-md bg-brand-500 py-2.5 font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
        >
          {mutation.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="mt-6 flex justify-between text-sm">
        <Link to={ROUTES.FORGOT_PASSWORD} className="text-brand-500 hover:underline">
          Forgot password?
        </Link>
        <Link to={ROUTES.SIGNUP} className="text-brand-500 hover:underline">
          Create an account
        </Link>
      </div>
    </main>
  );
};

/** `aria-describedby` wiring so screen readers announce the error with the field. */
const Field = ({ label, error, htmlFor, children }) => (
  <div>
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
      {label}
    </label>
    {children}
    {error && (
      <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-sm text-danger-500">
        {error}
      </p>
    )}
  </div>
);

export default Login;
