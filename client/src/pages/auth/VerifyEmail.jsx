import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ERROR_CODES } from '@verihire/shared';

import { authApi } from '../../api/services/auth.api.js';
import { ROUTES } from '../../routes/paths.js';
import { AuthShell } from './AuthShell.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Alert, Skeleton } from '../../components/ui/Feedback.jsx';

/**
 * Email verification — one route, two arrivals.
 *
 * With `?token=…` the user clicked the link in their inbox and this page is the confirmation.
 * Without one they have just signed up and are waiting, so it becomes the "check your email"
 * screen with a way to resend.
 *
 * ★ The token is redeemed through `useQuery`, not `useEffect` + `useMutation`. React's
 * StrictMode double-invokes effects in development, and a single-use token redeemed twice
 * succeeds then fails — showing "this link is not valid" to somebody whose account was in
 * fact just verified. Query dedupes by key, so the request fires once.
 */
export const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const token = searchParams.get('token');

  const { isLoading, isSuccess, isError, error } = useQuery({
    queryKey: ['auth', 'verify-email', token],
    queryFn: () => authApi.verifyEmail(token),
    enabled: Boolean(token),
    retry: false,
    // Single-use: never refetch it on focus or reconnect, or the second call fails.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  if (token) {
    return (
      <AuthShell title="Verifying your email">
        {isLoading && <Skeleton className="h-20" />}

        {isSuccess && (
          <>
            <Alert tone="success" title="Your email is verified">
              You can sign in now.
            </Alert>
            <Link to={ROUTES.LOGIN} className="mt-4 block">
              <Button fullWidth>Continue to sign in</Button>
            </Link>
          </>
        )}

        {isError && (
          <>
            {/*
              An expired link is the common case and is not the user's fault, so it gets its
              own copy and a way out rather than a generic failure.
            */}
            <Alert tone="danger" title="This link did not work">
              {error?.code === ERROR_CODES.ALREADY_VERIFIED
                ? 'This address is already verified — you can go straight to signing in.'
                : 'Verification links expire after 24 hours and can only be used once. Request a fresh one below.'}
            </Alert>

            {error?.code === ERROR_CODES.ALREADY_VERIFIED ? (
              <Link to={ROUTES.LOGIN} className="mt-4 block">
                <Button fullWidth>Sign in</Button>
              </Link>
            ) : (
              <div className="mt-6">
                <ResendForm />
              </div>
            )}
          </>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Check your email"
      description={
        location.state?.email ? (
          <>
            We sent a verification link to <strong className="text-ink">{location.state.email}</strong>.
            Click it to activate your account.
          </>
        ) : (
          'We sent you a verification link. Click it to activate your account.'
        )
      }
      footer={
        <>
          Already verified?{' '}
          <Link to={ROUTES.LOGIN} className="font-medium text-brand-500 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <ResendForm defaultEmail={location.state?.email} />
    </AuthShell>
  );
};

/**
 * Resend.
 *
 * ★ The server answers 200 whether or not the address has an account, so this form must not
 * imply otherwise — a resend that said "no such user" would turn the endpoint into a free
 * lookup for who on a leaked email list is job-hunting. The copy is deliberately
 * non-committal for that reason.
 */
const ResendForm = ({ defaultEmail = '' }) => {
  const [email, setEmail] = useState(defaultEmail);

  const resend = useMutation({ mutationFn: () => authApi.resendVerification(email) });

  if (resend.isSuccess) {
    return (
      <Alert tone="success" title="On its way">
        If that address has an account awaiting verification, a new link is in the inbox. It can
        take a minute to arrive — check spam before trying again.
      </Alert>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        resend.mutate();
      }}
      className="space-y-4"
      noValidate
    >
      <Input
        label="Email address"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        hint="Didn't get the email? We'll send another."
      />

      {resend.isError && (
        <Alert tone="danger">
          {resend.error?.code === ERROR_CODES.TOO_MANY_REQUESTS
            ? 'Too many requests. Wait a few minutes before asking for another link.'
            : resend.error?.message}
        </Alert>
      )}

      <Button type="submit" fullWidth variant="secondary" isLoading={resend.isPending} disabled={!email}>
        Resend verification email
      </Button>
    </form>
  );
};

export default VerifyEmail;
