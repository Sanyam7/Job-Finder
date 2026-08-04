import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  COMPANY_SIZE_VALUES,
  DOCUMENT_TYPE_META,
  DOCUMENT_TYPE_VALUES,
  ERROR_CODES,
  INDUSTRIES,
  LIMITS,
  VERIFICATION_STATUS,
  emailDomainMatchesWebsite,
  formatBytes,
  isFreeEmailDomain,
} from '@verihire/shared';

import { employerApi } from '../../api/services/index.js';
import { ROUTES } from '../../routes/paths.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input, Textarea, Select } from '../../components/ui/Input.jsx';
import { PageHeader, Card, CardHeader } from '../../components/ui/Card.jsx';
import { Alert, ErrorState, Skeleton } from '../../components/ui/Feedback.jsx';
import { Badge, VerificationBadge } from '../../components/ui/Badge.jsx';

/**
 * The company profile — the evidence an admin reviews at gate 1.
 *
 * ★ This form is where employers assemble the case for their own verification, so it is
 * written to show them what the reviewer will see. The two automated signals the admin queue
 * surfaces — does the contact email match the website domain, is it a free mail provider —
 * are computed here from the same shared helpers, live, as they type. An employer who fixes
 * a mismatch before submitting saves a rejection round trip for both sides.
 *
 * ★ Reachable while unverified, by design. The route sits outside `VerifiedEmployerRoute`
 * because a gate that hides the form which opens it is just a dead end.
 */
export const CompanyProfile = () => {
  const queryClient = useQueryClient();

  const { data: company, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['employer', 'me'],
    queryFn: employerApi.me,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['employer'] });

  if (isLoading) return <Skeleton className="h-96" />;
  if (isError) return <ErrorState message={error?.message} onRetry={refetch} />;

  const isLocked = company.verificationStatus === VERIFICATION_STATUS.PENDING;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Company profile"
        description="What candidates see on your listings, and what our reviewers check."
        actions={<VerificationBadge status={company.verificationStatus} />}
      />

      {/*
        Editing while a submission is in the queue is allowed but is worth flagging: the
        reviewer may be looking at the old version right now.
      */}
      {isLocked && (
        <Alert tone="info" className="mb-4">
          A reviewer is looking at this submission. You can still make changes — they will see
          whatever is here when they open it, so a change now may not match what they started
          reading.
        </Alert>
      )}

      {company.verificationStatus === VERIFICATION_STATUS.REJECTED && (
        <Alert
          tone="danger"
          title="This was rejected"
          className="mb-4"
          action={
            <Link to={ROUTES.EMPLOYER_VERIFICATION}>
              <Button size="sm" variant="secondary">
                Resubmit
              </Button>
            </Link>
          }
        >
          <p className="whitespace-pre-wrap">{company.verification?.rejectionReason}</p>
        </Alert>
      )}

      {company.suspension && (
        <Alert tone="danger" title="This company is suspended" className="mb-4">
          <p className="whitespace-pre-wrap">{company.suspension.reason}</p>
          <p className="mt-2 text-xs opacity-80">
            Your listings are hidden from candidates while a suspension is in force.
          </p>
        </Alert>
      )}

      <div className="space-y-4">
        <LogoCard company={company} onChanged={invalidate} />
        <DetailsForm company={company} onSaved={invalidate} />
        <DocumentsCard company={company} onChanged={invalidate} />
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------- logo */

const LogoCard = ({ company, onChanged }) => {
  const [fileError, setFileError] = useState(null);

  const upload = useMutation({
    mutationFn: employerApi.uploadLogo,
    onSuccess: onChanged,
    onError: (error) => setFileError(error.message),
  });

  const pick = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > LIMITS.MAX_IMAGE_BYTES) {
      setFileError(`That image is ${formatBytes(file.size)}. The limit is ${formatBytes(LIMITS.MAX_IMAGE_BYTES)}.`);
      return;
    }
    setFileError(null);
    upload.mutate(file);
  };

  return (
    <Card>
      <CardHeader title="Logo" description="Shown on every listing and in search results." />
      <div className="mt-4 flex items-center gap-4">
        {company.logo ? (
          <img
            src={company.logo}
            alt={`${company.companyName} logo`}
            className="h-16 w-16 rounded-md border border-border object-contain"
          />
        ) : (
          <div className="grid h-16 w-16 place-items-center rounded-md border border-dashed border-border text-xl font-semibold text-muted">
            {company.companyName?.[0] ?? '?'}
          </div>
        )}

        <div>
          <label className="cursor-pointer">
            <span className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-elevated">
              {company.logo ? 'Replace logo' : 'Upload logo'}
            </span>
            <input type="file" accept="image/*" onChange={pick} className="sr-only" />
          </label>
          <p className="mt-1 text-xs text-muted">
            PNG, JPG or WebP · up to {formatBytes(LIMITS.MAX_IMAGE_BYTES)}
          </p>
          {upload.isPending && <p className="text-xs text-brand-500">Uploading…</p>}
        </div>
      </div>

      {fileError && (
        <Alert tone="danger" className="mt-3">
          {fileError}
        </Alert>
      )}
    </Card>
  );
};

/* ----------------------------------------------------------------- details */

const DetailsForm = ({ company, onSaved }) => {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm({ defaultValues: toForm(company) });

  const save = useMutation({
    mutationFn: employerApi.update,
    onSuccess: (data) => {
      onSaved();
      reset(toForm(data));
    },
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

  const website = watch('website');
  const contactEmail = watch('contact.email');
  const description = watch('description') ?? '';

  return (
    <Card>
      <CardHeader title="Details" />
      <form onSubmit={handleSubmit((values) => save.mutate(toPayload(values)))} className="mt-4" noValidate>
        <Input
          label="Company name"
          required
          maxLength={LIMITS.MAX_COMPANY_NAME_LENGTH}
          hint="Exactly as it appears on your registration documents — a mismatch is the most common reason for rejection."
          error={errors.companyName?.message}
          {...register('companyName', { required: 'A company name is required' })}
        />

        <Input
          label="Tagline"
          maxLength={LIMITS.MAX_TAGLINE_LENGTH}
          placeholder="Payments infrastructure for Indian SMBs"
          error={errors.tagline?.message}
          {...register('tagline')}
        />

        <Textarea
          label="About the company"
          value={description}
          maxLength={LIMITS.MAX_COMPANY_DESCRIPTION_LENGTH}
          className="min-h-[160px]"
          hint="At least 50 characters. What you do and who you do it for."
          error={errors.description?.message}
          {...register('description')}
        />

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Select
            label="Industry"
            placeholder="Choose an industry"
            options={INDUSTRIES.map((v) => ({ value: v, label: v }))}
            error={errors.industry?.message}
            {...register('industry')}
          />
          <Select
            label="Company size"
            placeholder="Not specified"
            options={COMPANY_SIZE_VALUES.map((v) => ({ value: v, label: `${v} people` }))}
            {...register('companySize')}
          />
          <Input
            type="number"
            label="Founded"
            min={LIMITS.MIN_FOUNDED_YEAR}
            max={new Date().getFullYear()}
            error={errors.foundedYear?.message}
            {...register('foundedYear')}
          />
          <Input
            label="GSTIN"
            hint="Optional, but it speeds verification up considerably."
            error={errors.gstNumber?.message}
            {...register('gstNumber')}
          />
        </div>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Input
            label="Website"
            type="url"
            placeholder="https://yourcompany.com"
            error={errors.website?.message}
            {...register('website')}
          />
          <Input
            label="LinkedIn page"
            type="url"
            placeholder="https://linkedin.com/company/…"
            error={errors.linkedin?.message}
            {...register('linkedin')}
          />
        </div>

        <fieldset className="mb-4">
          <legend className="mb-1.5 text-sm font-medium text-ink">Contact</legend>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <Input
              label="Email"
              type="email"
              error={errors['contact.email']?.message}
              {...register('contact.email')}
            />
            <Input label="Phone" type="tel" {...register('contact.phone')} />
            <Input label="Contact name" {...register('contact.hrName')} />
          </div>

          {/* ★ The reviewer's automated signals, shown live. Same helpers, same answers. */}
          <ContactSignals email={contactEmail} website={website} />
        </fieldset>

        <fieldset className="mb-4">
          <legend className="mb-1.5 text-sm font-medium text-ink">Registered address</legend>
          <Input label="Address line" {...register('address.line1')} />
          <div className="grid gap-x-4 sm:grid-cols-4">
            <Input label="City" {...register('address.city')} />
            <Input label="State" {...register('address.state')} />
            <Input label="Country" {...register('address.country')} />
            <Input label="Postal code" {...register('address.postalCode')} />
          </div>
        </fieldset>

        {errors.root && <Alert tone="danger">{errors.root.message}</Alert>}

        <div className="flex items-center justify-end gap-3">
          {save.isSuccess && !isDirty && <span className="text-xs text-accent-600">Saved</span>}
          <Button type="submit" disabled={!isDirty} isLoading={save.isPending}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
};

/**
 * ★ The two checks an admin sees on the queue row, mirrored here.
 *
 * Neither is a blocker — plenty of legitimate small companies run on Gmail, and a matching
 * domain proves very little on its own. They are shown because an employer who knows what is
 * being looked at can fix the easy half themselves.
 */
const ContactSignals = ({ email, website }) => {
  if (!email) return null;

  const matches = website ? emailDomainMatchesWebsite(email, website) : null;
  const isFree = isFreeEmailDomain(email);

  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {matches === true && (
        <Badge tone="success" size="sm">
          Email domain matches your website
        </Badge>
      )}
      {matches === false && !isFree && (
        <Badge tone="warning" size="sm">
          Email domain doesn&apos;t match your website
        </Badge>
      )}
      {isFree && (
        <Badge tone="warning" size="sm" title="Not a blocker — reviewers just check it more closely">
          Free mail provider — a company address verifies faster
        </Badge>
      )}
    </div>
  );
};

/* --------------------------------------------------------------- documents */

/**
 * Verification documents.
 *
 * ★ These are the most sensitive files in the product — incorporation certificates and
 * government IDs. The API never returns a URL for them, only metadata; even an admin gets a
 * short-lived signed link through an audited endpoint. So this list shows names and sizes and
 * offers no "view" affordance at all, which is the honest reflection of what the client can
 * actually reach.
 */
const DocumentsCard = ({ company, onChanged }) => {
  // Annotated so the select can set any document type, not just the first one's literal.
  const [type, setType] = useState(/** @type {string} */ (DOCUMENT_TYPE_VALUES[0]));
  const [fileError, setFileError] = useState(null);

  const upload = useMutation({
    mutationFn: (/** @type {{files: File[], types: string[]}} */ vars) =>
      employerApi.uploadDocuments(vars.files, vars.types),
    onSuccess: onChanged,
    onError: (error) => setFileError(error.message),
  });

  const remove = useMutation({ mutationFn: employerApi.removeDocument, onSuccess: onChanged });

  const documents = company.documents ?? [];
  const uploadedTypes = new Set(documents.map((d) => d.type));
  const requiredMissing = DOCUMENT_TYPE_VALUES.filter(
    (t) => DOCUMENT_TYPE_META[t].required && !uploadedTypes.has(t),
  );

  const pick = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > LIMITS.MAX_DOCUMENT_BYTES) {
      setFileError(`That file is ${formatBytes(file.size)}. The limit is ${formatBytes(LIMITS.MAX_DOCUMENT_BYTES)}.`);
      return;
    }
    if (documents.length >= LIMITS.MAX_COMPANY_DOCUMENTS) {
      setFileError(`You can upload up to ${LIMITS.MAX_COMPANY_DOCUMENTS} documents.`);
      return;
    }
    setFileError(null);
    upload.mutate({ files: [file], types: [type] });
    // Clearing lets the same file be re-picked after an error; without it the change event
    // never fires a second time.
    event.target.value = '';
  };

  return (
    <Card>
      <CardHeader
        title="Verification documents"
        description="Seen only by our reviewers. Never shown to candidates, never downloadable from this page."
      />

      {requiredMissing.length > 0 && (
        <Alert tone="warning" className="mt-4">
          Still needed: {requiredMissing.map((t) => DOCUMENT_TYPE_META[t].label).join(', ')}.
        </Alert>
      )}

      <ul className="mt-4 divide-y divide-border">
        {documents.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm">
                <span className="truncate font-medium">{doc.originalName}</span>
                <Badge tone="neutral" size="sm">
                  {DOCUMENT_TYPE_META[doc.type]?.label ?? doc.type}
                </Badge>
              </p>
              <p className="text-xs text-muted">
                {formatBytes(doc.sizeBytes)} · uploaded {formatDate(doc.uploadedAt)}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              isLoading={remove.isPending}
              onClick={() => remove.mutate(doc.id)}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>

      {documents.length === 0 && (
        <p className="mt-4 text-sm text-muted">Nothing uploaded yet.</p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Select
            label="Document type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            options={DOCUMENT_TYPE_VALUES.map((v) => ({
              value: v,
              label: DOCUMENT_TYPE_META[v].required
                ? `${DOCUMENT_TYPE_META[v].label} (required)`
                : DOCUMENT_TYPE_META[v].label,
            }))}
          />
        </div>
        <label className="mb-5 cursor-pointer">
          <span className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm hover:bg-elevated">
            {upload.isPending ? 'Uploading…' : 'Choose file'}
          </span>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            onChange={pick}
            className="sr-only"
            disabled={upload.isPending}
          />
        </label>
        <p className="mb-6 text-xs text-muted">
          PDF or image · up to {formatBytes(LIMITS.MAX_DOCUMENT_BYTES)} ·{' '}
          {documents.length}/{LIMITS.MAX_COMPANY_DOCUMENTS} used
        </p>
      </div>

      {fileError && <Alert tone="danger">{fileError}</Alert>}

      {company.verificationStatus !== VERIFICATION_STATUS.VERIFIED && (
        <div className="mt-4 border-t border-border pt-4">
          <Link to={ROUTES.EMPLOYER_VERIFICATION}>
            <Button variant="secondary">Go to verification</Button>
          </Link>
        </div>
      )}
    </Card>
  );
};

/* ------------------------------------------------------------- transforms */

const toForm = (company) => ({
  companyName: company.companyName ?? '',
  tagline: company.tagline ?? '',
  description: company.description ?? '',
  industry: company.industry ?? '',
  companySize: company.companySize ?? '',
  foundedYear: company.foundedYear ?? '',
  website: company.website ?? '',
  linkedin: company.linkedin ?? '',
  gstNumber: company.gstNumber ?? '',
  contact: {
    email: company.contact?.email ?? '',
    phone: company.contact?.phone ?? '',
    hrName: company.contact?.hrName ?? '',
  },
  address: {
    line1: company.address?.line1 ?? '',
    city: company.address?.city ?? '',
    state: company.address?.state ?? '',
    country: company.address?.country ?? '',
    postalCode: company.address?.postalCode ?? '',
  },
});

/**
 * Blank optional fields are omitted, not sent as `''`.
 *
 * The validators use `optional({values: 'falsy'})`, so an empty string skips validation — but
 * `foundedYear: ''` would still reach Mongoose as a cast error. Omitting is the shape the API
 * is written for.
 */
const toPayload = (values) => {
  const out = {
    companyName: values.companyName.trim(),
    contact: pruned(values.contact),
    address: pruned(values.address),
  };

  for (const key of ['tagline', 'description', 'industry', 'companySize', 'website', 'linkedin', 'gstNumber']) {
    const value = String(values[key] ?? '').trim();
    if (value) out[key] = value;
  }

  if (values.foundedYear !== '' && values.foundedYear != null) {
    out.foundedYear = Number(values.foundedYear);
  }

  return out;
};

const pruned = (object) =>
  Object.fromEntries(
    Object.entries(object ?? {})
      .map(([key, value]) => [key, String(value ?? '').trim()])
      .filter(([, value]) => value !== ''),
  );

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';

export default CompanyProfile;
