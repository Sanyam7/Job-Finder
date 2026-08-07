import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUS,
  ACCOUNT_STATUS_META,
  ACCOUNT_STATUS_VALUES,
  LIMITS,
  ROLE_META,
} from '@verihire/shared';

import { adminApi } from '../../api/services/index.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input, Select, Textarea } from '../../components/ui/Input.jsx';
import { PageHeader, Card, TableWrap, Th, Td } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Alert, EmptyState, ErrorState, TableSkeleton } from '../../components/ui/Feedback.jsx';

/**
 * The admin users table.
 *
 * ★ Suspension needs a written reason, enforced at the validator, the service and here. This
 * is the most consequential button in the product for the person on the other end of it —
 * an employer suspension also pulls every one of their live listings in the same transaction —
 * and "suspended by an admin, no reason recorded" is not something anyone can appeal or audit.
 *
 * ★ The server refuses an admin's attempt to suspend themselves with a 400, because there is
 * no in-app recovery from it. The button is hidden here too — a control that exists only to
 * produce an error is a trap, not a safeguard — but the server check is the real one.
 */
export const Users = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [confirming, setConfirming] = useState(null);

  const role = searchParams.get('role') ?? '';
  const status = searchParams.get('status') ?? '';
  const search = searchParams.get('q') ?? '';

  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'users', { role, status, search }],
    queryFn: () =>
      adminApi.listUsers({
        role: role || undefined,
        status: status || undefined,
        search: search || undefined,
        limit: 50,
      }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });

  const suspend = useMutation({
    // Annotated on the parameter so TanStack Query infers the variables type; see the note in
    // pages/candidate/Applications.jsx.
    mutationFn: (/** @type {{id: string, reason: string}} */ vars) =>
      adminApi.suspendUser(vars.id, vars.reason),
    onSuccess: () => {
      setConfirming(null);
      invalidate();
    },
  });

  const restore = useMutation({ mutationFn: adminApi.restoreUser, onSuccess: invalidate });

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  if (isError) return <ErrorState message={error?.message} onRetry={refetch} />;

  const users = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Users"
        description="Everyone with an account. Suspension is immediate and always recorded."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Input
          label="Search"
          placeholder="Name or email"
          defaultValue={search}
          // Committed on blur/Enter rather than per keystroke: the URL is the query key, so
          // a change per character is a request per character.
          onBlur={(event) => setParam('q', event.target.value.trim())}
          onKeyDown={(event) => event.key === 'Enter' && setParam('q', event.currentTarget.value.trim())}
        />
        <Select
          label="Role"
          value={role}
          placeholder="All roles"
          onChange={(event) => setParam('role', event.target.value)}
          options={ACCOUNT_ROLES.map((v) => ({ value: v, label: ROLE_META[v].label }))}
        />
        <Select
          label="Status"
          value={status}
          placeholder="All statuses"
          onChange={(event) => setParam('status', event.target.value)}
          options={ACCOUNT_STATUS_VALUES.map((v) => ({ value: v, label: ACCOUNT_STATUS_META[v].label }))}
        />
      </div>

      {(suspend.isError || restore.isError) && (
        <Alert tone="danger" className="mb-4">
          {suspend.error?.message ?? restore.error?.message}
        </Alert>
      )}

      {isLoading ? (
        <TableSkeleton rows={8} columns={5} />
      ) : users.length === 0 ? (
        <EmptyState
          title="No users match"
          description="Try clearing the filters."
          action={{ label: 'Clear filters', onClick: () => setSearchParams({}, { replace: true }) }}
        />
      ) : (
        <>
          <TableWrap>
            <table className="w-full">
              <thead className="border-b border-border bg-elevated">
                <tr>
                  <Th>User</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Joined</Th>
                  <Th><span className="sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <tr key={user.id}>
                    <Td>
                      <p className="font-medium">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs text-muted">{user.email}</p>
                    </Td>

                    <Td>
                      <Badge tone="neutral">{ROLE_META[user.role]?.label ?? user.role}</Badge>
                    </Td>

                    <Td>
                      <Badge tone={ACCOUNT_STATUS_META[user.status]?.tone} dot>
                        {ACCOUNT_STATUS_META[user.status]?.label ?? user.status}
                      </Badge>
                      {user.suspendedReason && (
                        <p className="mt-1 max-w-[16rem] truncate text-xs text-muted" title={user.suspendedReason}>
                          {user.suspendedReason}
                        </p>
                      )}
                    </Td>

                    <Td className="whitespace-nowrap text-muted">{formatDate(user.createdAt)}</Td>

                    <Td>
                      <div className="flex justify-end">
                        {user.status === ACCOUNT_STATUS.SUSPENDED ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            isLoading={restore.isPending && restore.variables === user.id}
                            onClick={() => restore.mutate(user.id)}
                          >
                            Restore
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setConfirming(user)}>
                            Suspend
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>

          {data?.pagination && (
            <p className="mt-3 text-xs text-muted">
              Showing {users.length} of {data.pagination.totalItems}
            </p>
          )}
        </>
      )}

      {confirming && (
        <SuspendDialog
          user={confirming}
          isPending={suspend.isPending}
          error={suspend.error?.message}
          onCancel={() => setConfirming(null)}
          onConfirm={(reason) => suspend.mutate({ id: confirming.id, reason })}
        />
      )}
    </div>
  );
};

/**
 * Suspension confirmation.
 *
 * The reason field is the dialog's whole purpose — the confirmation is a side effect of
 * making somebody write one down. It states the consequence for employers explicitly,
 * because an admin suspending a company account may not realise it also pulls every live
 * listing that company has.
 */
const SuspendDialog = ({ user, onConfirm, onCancel, isPending, error }) => {
  const [reason, setReason] = useState('');
  const tooShort = reason.trim().length < LIMITS.MIN_REJECTION_REASON_LENGTH;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="suspend-title"
        className="w-full max-w-md"
      >
        <h2 id="suspend-title" className="text-base font-semibold">
          Suspend {user.firstName} {user.lastName}?
        </h2>

        <p className="mt-1 text-sm text-muted">
          They are signed out immediately and cannot sign back in.
          {user.role === 'EMPLOYER' &&
            ' Because this is an employer account, every live listing from their company is pulled from search in the same action.'}
        </p>

        <div className="mt-4">
          <Textarea
            label="Reason"
            required
            value={reason}
            maxLength={LIMITS.MAX_ADMIN_NOTE_LENGTH}
            onChange={(event) => setReason(event.target.value)}
            hint={`At least ${LIMITS.MIN_REJECTION_REASON_LENGTH} characters. Recorded in the audit log and shown to them.`}
          />
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={tooShort}
            isLoading={isPending}
            onClick={() => onConfirm(reason.trim())}
          >
            Suspend account
          </Button>
        </div>
      </Card>
    </div>
  );
};

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

export default Users;
