import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  EMPLOYER_REJECTION_CATEGORY_META,
  VERIFICATION_STATUS,
  VERIFICATION_STATUS_META,
} from '@verihire/shared';
import { adminApi } from '../../api/services/index.js';
import { Button } from '../../components/ui/Button.jsx';
import { Textarea, Select, Checkbox } from '../../components/ui/Input.jsx';
import { Badge, VerificationBadge } from '../../components/ui/Badge.jsx';
import { Alert, EmptyState, ErrorState, TableSkeleton } from '../../components/ui/Feedback.jsx';
import { PageHeader, Card, TableWrap, Th, Td } from '../../components/ui/Card.jsx';
import { cn } from '../../utils/cn.js';

/**
 * ★★ GATE 1 — the human verification queue.
 *
 * This screen is the product. Everything else exists to route work here and to honour the
 * decision made on it, so it is designed around the two ways that decision goes wrong:
 *
 *  - **Approving too fast.** The checklist is mandatory and un-skippable; the approve button
 *    is disabled until every box is ticked. Automated signals are surfaced *next to* the
 *    evidence so a mismatch is noticed rather than looked for.
 *  - **Rejecting without telling them why.** A reason is required, and the copy says it goes
 *    to the employer verbatim — because it does.
 */

const CHECKLIST = [
  { key: 'companyNameMatches', label: 'Company name matches the incorporation document' },
  { key: 'websiteLive', label: 'Website is live and describes this company' },
  { key: 'emailDomainMatches', label: 'Contact email domain matches the website' },
  { key: 'documentsValid', label: 'Documents are legible and unaltered' },
  { key: 'identityValid', label: 'Signatory ID matches the named contact' },
];

export const EmployerQueue = () => {
  // Annotated because `useState('PENDING')` infers the literal, and the filter dropdown then
  // cannot set any other status.
  const [status, setStatus] = useState(/** @type {string} */ (VERIFICATION_STATUS.PENDING));
  const [selectedId, setSelectedId] = useState(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'employers', status],
    queryFn: () => adminApi.listEmployers({ status, sort: 'oldest' }),
    // The queue moves while an admin works through it; 30s keeps two admins from spending
    // ten minutes each on the same company.
    refetchInterval: 30_000,
  });

  const rows = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Employer verification"
        description="Nothing this company posts can reach a candidate until it is approved here."
        actions={
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={Object.entries(VERIFICATION_STATUS_META).map(([value, meta]) => ({
              value,
              label: meta.label,
            }))}
          />
        }
      />

      {status === VERIFICATION_STATUS.PENDING && rows.length > 0 && (
        <Alert tone="warning" className="mb-4">
          {rows.length} compan{rows.length === 1 ? 'y is' : 'ies are'} waiting. The oldest has
          been waiting {rows[0]?.waitingHours ?? 0} hours — companies are shown oldest first so
          nobody is overtaken indefinitely.
        </Alert>
      )}

      {isError && <ErrorState message={error?.message} requestId={error?.requestId} onRetry={refetch} />}
      {isLoading && <TableSkeleton rows={5} columns={5} />}

      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState
          title={
            status === VERIFICATION_STATUS.PENDING
              ? 'Nothing waiting for review'
              : `No ${VERIFICATION_STATUS_META[status]?.label.toLowerCase()} companies`
          }
          description={
            status === VERIFICATION_STATUS.PENDING
              ? 'The queue is clear. New submissions appear here automatically.'
              : undefined
          }
        />
      )}

      {rows.length > 0 && (
        <TableWrap>
          <table className="w-full">
            <thead className="border-b border-border bg-elevated">
              <tr>
                <Th>Company</Th>
                <Th>Contact</Th>
                <Th>Documents</Th>
                <Th>Waiting</Th>
                <Th className="text-right">Review</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((employer) => (
                <tr key={employer.id} className="hover:bg-elevated/50">
                  <Td>
                    <p className="font-medium">{employer.companyName}</p>
                    <p className="text-xs text-muted">{employer.website}</p>
                  </Td>
                  <Td>
                    <p className="text-sm">{employer.contactEmail}</p>
                    {/*
                      ★ The automated signals sit on the row, not behind a click. An admin
                      scanning twenty companies should see "free mail provider" without
                      opening each one — that is what makes the obvious frauds obvious.
                    */}
                    {employer.signals?.map((signal) => (
                      <Badge key={signal.code} tone="warning" size="sm" className="mr-1 mt-1">
                        {signal.label}
                      </Badge>
                    ))}
                  </Td>
                  <Td>{employer.documentCount ?? 0}</Td>
                  <Td>
                    <span className={cn((employer.waitingHours ?? 0) > 48 && 'font-medium text-warn-600')}>
                      {employer.waitingHours ?? 0}h
                    </span>
                  </Td>
                  <Td className="text-right">
                    {status === VERIFICATION_STATUS.PENDING ? (
                      <Button size="sm" onClick={() => setSelectedId(employer.id)}>
                        Review
                      </Button>
                    ) : (
                      <VerificationBadge status={employer.verificationStatus} />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {selectedId && (
        <ReviewPanel employerId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
};

/**
 * The decision panel.
 *
 * Kept in the same screen rather than on its own route: an admin working a queue of twenty
 * should not lose their place in the list every time they open one.
 */
const ReviewPanel = ({ employerId, onClose }) => {
  const queryClient = useQueryClient();
  const [checklist, setChecklist] = useState({});
  const [mode, setMode] = useState('approve');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('INVALID_DOCS');

  const { data: employer, isLoading } = useQuery({
    queryKey: ['admin', 'employer', employerId],
    queryFn: () => adminApi.getEmployer(employerId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin'] });
    onClose();
  };

  const verify = useMutation({
    mutationFn: () => adminApi.verifyEmployer(employerId, checklist),
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: () => adminApi.rejectEmployer(employerId, { reason, category }),
    onSuccess: invalidate,
  });

  /** ★ Every box, every time. The server enforces this too. */
  const checklistComplete = CHECKLIST.every((item) => checklist[item.key]);
  const reasonValid = reason.trim().length >= 10;
  const pending = verify.isPending || reject.isPending;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6">
      <Card
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Verify company"
      >
        {isLoading && <p className="text-sm text-muted">Loading…</p>}

        {employer && (
          <>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">{employer.companyName}</h2>
                <a
                  href={employer.website}
                  target="_blank"
                  // `noreferrer` as well as `noopener`: the target page should not learn
                  // the admin URL it was opened from.
                  rel="noopener noreferrer"
                  className="text-sm text-brand-500 hover:underline"
                >
                  {employer.website} ↗
                </a>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>

            {employer.signals?.length > 0 && (
              <Alert tone="warning" title="Automated checks flagged this submission" className="mb-4">
                <ul className="mt-1 list-inside list-disc">
                  {employer.signals.map((signal) => (
                    <li key={signal.code}>{signal.detail ?? signal.label}</li>
                  ))}
                </ul>
              </Alert>
            )}

            <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <Field label="Industry" value={employer.industry} />
              <Field label="Company size" value={employer.companySize} />
              <Field label="Contact" value={employer.contact?.email} />
              <Field label="Phone" value={employer.contact?.phone} />
            </dl>

            <section className="mb-4">
              <h3 className="mb-2 text-sm font-semibold">Documents</h3>
              <div className="space-y-2">
                {employer.documents?.map((doc) => (
                  <DocumentRow key={doc.id} employerId={employerId} doc={doc} />
                ))}
                {!employer.documents?.length && (
                  <p className="text-sm text-muted">No documents were uploaded.</p>
                )}
              </div>
            </section>

            <div className="mb-4 flex gap-2 border-b border-border">
              <TabButton active={mode === 'approve'} onClick={() => setMode('approve')}>
                Approve
              </TabButton>
              <TabButton active={mode === 'reject'} onClick={() => setMode('reject')}>
                Reject
              </TabButton>
            </div>

            {mode === 'approve' ? (
              <>
                <p className="mb-3 text-sm text-muted">
                  Confirm each check. Approving publishes every job of theirs that has already
                  been approved and has not expired.
                </p>
                <div className="space-y-2">
                  {CHECKLIST.map((item) => (
                    <Checkbox
                      key={item.key}
                      label={item.label}
                      checked={Boolean(checklist[item.key])}
                      onChange={(event) =>
                        setChecklist((prev) => ({ ...prev, [item.key]: event.target.checked }))
                      }
                    />
                  ))}
                </div>

                {verify.isError && (
                  <Alert tone="danger" className="mt-3">
                    {verify.error?.message}
                  </Alert>
                )}

                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    variant="success"
                    // Disabled, not "warn on click": an admin who has clicked through
                    // nineteen of these will click through the twentieth.
                    disabled={!checklistComplete}
                    isLoading={verify.isPending}
                    onClick={() => verify.mutate()}
                  >
                    Verify company
                  </Button>
                </div>
                {!checklistComplete && (
                  <p className="mt-2 text-right text-xs text-muted">
                    Complete every check to enable approval.
                  </p>
                )}
              </>
            ) : (
              <>
                <Select
                  label="Category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  options={Object.entries(EMPLOYER_REJECTION_CATEGORY_META).map(([value, meta]) => ({
                    value,
                    label: meta.label,
                  }))}
                />
                <Textarea
                  label="Reason"
                  required
                  value={reason}
                  maxLength={1000}
                  onChange={(event) => setReason(event.target.value)}
                  // The employer reads this exact text. Saying so changes how it gets written.
                  hint="Sent to the employer word for word. Tell them what to fix so they can resubmit."
                  error={reason && !reasonValid ? 'Give at least 10 characters of explanation' : undefined}
                />

                {reject.isError && <Alert tone="danger">{reject.error?.message}</Alert>}

                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    disabled={!reasonValid || pending}
                    isLoading={reject.isPending}
                    onClick={() => reject.mutate()}
                  >
                    Reject submission
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

/**
 * A KYC document.
 *
 * The URL is fetched on demand rather than embedded in the list response, because viewing it
 * is audit-logged server-side — an admin opening someone's passport scan is recorded, and a
 * pre-signed URL sitting in a JSON payload would bypass that entirely.
 */
const DocumentRow = ({ employerId, doc }) => {
  const [isOpening, setOpening] = useState(false);

  const open = async () => {
    setOpening(true);
    try {
      const { url } = await adminApi.viewDocument(employerId, doc.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="flex items-center justify-between rounded-md border border-border p-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{doc.type}</p>
        <p className="truncate text-xs text-muted">{doc.originalName}</p>
      </div>
      <Button size="sm" variant="secondary" isLoading={isOpening} onClick={open}>
        View
      </Button>
    </div>
  );
};

const Field = ({ label, value }) => (
  <div>
    <dt className="text-xs text-muted">{label}</dt>
    <dd className="text-ink">{value || '—'}</dd>
  </div>
);

const TabButton = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
      active ? 'border-brand-500 text-brand-500' : 'border-transparent text-muted hover:text-ink',
    )}
  >
    {children}
  </button>
);

export default EmployerQueue;
