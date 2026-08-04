import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BOOKMARK_ENTITY } from '@verihire/shared';

import { bookmarkApi } from '../../api/services/index.js';
import { ROUTES } from '../../routes/paths.js';
import { JobCard } from '../../features/jobs/components/JobCard.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader, Card } from '../../components/ui/Card.jsx';
import { Alert, EmptyState, ErrorState, JobCardSkeleton } from '../../components/ui/Feedback.jsx';

/**
 * Saved jobs.
 *
 * ★ The interesting case is the one that is no longer there. A bookmark outlives the listing
 * it points at: the job may since have been rejected, archived, expired, or belonged to a
 * company that was later suspended. The server re-runs the public visibility filter on read
 * and returns those rows as **tombstones** — `isAvailable: false` with no entity attached.
 *
 * Rendering them as tombstones rather than dropping them is a deliberate choice. Silently
 * removing a saved job makes the product look like it lost the user's data; showing a stale
 * card would send them to a 404 and, worse, imply a listing is live when the platform has
 * decided it is not. Neither is acceptable when the whole promise is that visible means
 * vetted.
 */
export const SavedJobs = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['bookmarks', BOOKMARK_ENTITY.JOB],
    queryFn: () => bookmarkApi.list({ entityType: BOOKMARK_ENTITY.JOB, limit: 50 }),
  });

  const toggle = useMutation({
    mutationFn: (jobId) => bookmarkApi.toggle({ entityType: BOOKMARK_ENTITY.JOB, entityId: jobId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookmarks'] }),
  });

  if (isError) return <ErrorState message={error?.message} onRetry={refetch} />;

  const bookmarks = data?.items ?? [];
  const available = bookmarks.filter((b) => b.isAvailable);
  const unavailable = bookmarks.filter((b) => !b.isAvailable);

  return (
    <div>
      <PageHeader
        title="Saved jobs"
        description="Only you can see this list."
      />

      {toggle.isError && (
        <Alert tone="danger" className="mb-4">
          {toggle.error?.message}
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <JobCardSkeleton />
          <JobCardSkeleton />
          <JobCardSkeleton />
        </div>
      ) : bookmarks.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          description="Save a listing from search and it will wait here. Saved jobs are private — no employer is told you looked."
          action={{ label: 'Browse jobs', onClick: () => navigate(ROUTES.JOBS) }}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {available.map((bookmark) => (
              <li key={bookmark.id}>
                <JobCard
                  job={bookmark.entity}
                  isSaved
                  onToggleSave={() => toggle.mutate(bookmark.entityId)}
                />
                {bookmark.note && (
                  <p className="mt-1 pl-1 text-xs text-muted">Your note: {bookmark.note}</p>
                )}
              </li>
            ))}
          </ul>

          {/* ★ The tombstones. */}
          {unavailable.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-1 text-sm font-semibold">No longer available</h2>
              <p className="mb-3 text-xs text-muted">
                These listings have closed, been withdrawn, or come from a company that is no
                longer active on VeriHire. We keep the row so you know what happened rather than
                quietly deleting it.
              </p>

              <ul className="space-y-2">
                {unavailable.map((bookmark) => (
                  <li key={bookmark.id}>
                    <Card className="flex items-center justify-between gap-3 opacity-75">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-muted line-through">
                          {/*
                            The server does not send the entity for a tombstone — that is the
                            point of the gate — so there is often nothing to show but the date.
                            The note the candidate wrote is theirs and is still shown.
                          */}
                          {bookmark.note || 'Saved listing'}
                        </p>
                        <p className="text-xs text-muted">Saved {formatDate(bookmark.savedAt)}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggle.mutate(bookmark.entityId)}
                      >
                        Remove
                      </Button>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
};

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';

export default SavedJobs;
