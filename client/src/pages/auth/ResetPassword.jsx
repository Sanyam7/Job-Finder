import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ERROR_CODES } from '@verihire/shared';

import { resetPasswordSchema } from '../../validations/auth.schema.js';
import { authApi } from '../../api/services/auth.api.js';
import { ROUTES } from '../../routes/paths.js';
import { AuthShell } from './AuthShell.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { PasswordRules } from '../../features/auth/PasswordRules.jsx';

/**
 * Set a new password from an emailed link.
 *
 * ★ A missing token is caught before the form renders. Letting someone compose a password,
 * submit, and only then learn the link was malformed wastes the one thing they came here with.
 *
 * ★ On success every session is revoked server-side — including this browser's, and including
 * whoever may have been in the account. That is the point of a reset, so the page says it
 * plainly instead of quietly bouncing the user to a login screen they did not expect.
 */
/**
 * Codes from which retyping the password cannot help — the link itself is spent.
 * Typed `string[]` so the membership test compares against the whole `ERROR_CODES` union.
 *
 * @type {string[]}
 */
const DEAD_TOKEN_CODES = [
  ERROR_CODES.TOKEN_INVALID,
  ERROR_CODES.TOKEN_EXPIRED,
  ERROR_CODES.BAD_REQUEST,
];

export const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: yupResolver(resetPasswordSchema), mode: 'onBlur' });

  const password = watch('password') ?? '';

  const mutation = useMutation({
    // Optional in the type yup infers even though the schema marks both required — this
    // matches what `handleSubmit` actually hands over.
    mutationFn: (/** @type {{password?: string, confirmPassword?: string}} */ values) =>
      authApi.resetPassword({ token, ...values }),
    onSuccess: () =>
      navigate(`${ROUTES.LOGIN}?reason=password_reset`, { replace: true }),
    onError: (error) => {
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

  if (!token) {
    return (
      <AuthShell title="This reset link is incomplete">
        <Alert tone="danger">
          The link is missing its token — some email clients wrap long URLs across lines. Try
          copying the whole link, or request a new one.
        </Alert>
        <Link to={ROUTES.FORGOT_PASSWORD} className="mt-4 block">
          <Button fullWidth>Request a new link</Button>
        </Link>
      </AuthShell>
    );
  }

  /*
   * TOKEN_INVALID / TOKEN_EXPIRED are terminal: no amount of retyping the password fixes
   * them, so the form is replaced rather than left on screen with an error above it.
   */
  const isDeadToken = mutation.isError && DEAD_TOKEN_CODES.includes(mutation.error?.code);

  if (isDeadToken) {
    return (
      <AuthShell title="This link has expired">
        <Alert tone="danger">
          Reset links last one hour and can only be used once. Request a fresh one — your old
          password still works until you complete a reset.
        </Alert>
        <Link to={ROUTES.FORGOT_PASSWORD} className="mt-4 block">
          <Button fullWidth>Request a new link</Button>
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      description="You will be signed out everywhere else once this is saved."
      footer={
        <Link to={ROUTES.LOGIN} className="font-medium text-brand-500 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="space-y-5"
        noValidate
      >
        {/*
          A hidden username field is not decoration: without it password managers cannot
          associate the new credential with an account, and people end up saving a password
          they can never autofill.
        */}
        <input type="text" name="username" autoComplete="username" className="hidden" readOnly />

        <div>
          <Input
            label="New password"
            type="password"
            required
            autoComplete="new-password"
            autoFocus
            error={errors.password?.message}
            {...register('password')}
          />
          <PasswordRules value={password} />
        </div>

        <Input
          label="Confirm new password"
          type="password"
          required
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        {errors.root && <Alert tone="danger">{errors.root.message}</Alert>}

        <Button type="submit" fullWidth isLoading={isSubmitting || mutation.isPending}>
          Save new password
        </Button>
      </form>
    </AuthShell>
  );
};

export default ResetPassword;
