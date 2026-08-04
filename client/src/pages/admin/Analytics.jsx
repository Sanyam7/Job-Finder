import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { APPLICATION_STATUS_META } from '@verihire/shared';
import { adminApi } from '../../api/services/index.js';
import { Select } from '../../components/ui/Input.jsx';
import { Alert, ErrorState, Skeleton } from '../../components/ui/Feedback.jsx';
import { PageHeader, Card, StatCard } from '../../components/ui/Card.jsx';
import { cn } from '../../utils/cn.js';

/**
 * Admin analytics.
 *
 * ★ Ordered by what an operator can act on, not by what looks impressive. Moderation health
 * leads, because manual review *is* the product — if the queue is backing up, everything else
 * on this page is describing a platform that is quietly failing its core promise.
 *
 * Charts are hand-rolled SVG rather than a charting library. Recharts is ~90 kB gzipped for
 * three bar charts on one admin-only route, and it would land in the shared vendor chunk that
 * every candidate downloads.
 */
export const Analytics = () => {
  const [range, setRange] = useState('30d');

  const { data: overview, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'analytics', 'overview', range],
    queryFn: () => adminApi.analytics.overview(range),
  });

  const { data: moderation } = useQuery({
    queryKey: ['admin', 'analytics', 'moderation', range],
    queryFn: () => adminApi.analytics.moderation(range),
  });

  const { data: users } = useQuery({
    queryKey: ['admin', 'analytics', 'users', range],
    queryFn: () => adminApi.analytics.users(range),
  });

  const { data: health } = useQuery({
    queryKey: ['admin', 'health', 'visibility'],
    queryFn: adminApi.visibilityHealth,
  });

  if (isError) return <ErrorState message={error?.message} onRetry={refetch} />;

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Is manual verification keeping up, and is the invariant holding?"
        actions={
          <Select
            aria-label="Date range"
            value={range}
            onChange={(event) => setRange(event.target.value)}
            options={[
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
            ]}
          />
        }
      />

      {/*
        ★ The invariant check, first on the page.
        A drifted flag means a listing is visible that should not be — the one failure that
        breaks the product's promise rather than merely degrading it.
      */}
      {health && !health.isHealthy && (
        <Alert tone="danger" title="Visibility drift detected" className="mb-4">
          {health.wronglyVisible} listing(s) are publicly visible but should not be, and{' '}
          {health.wronglyHidden} are hidden but should be live. The nightly reconciliation will
          correct this, but a non-zero count means a write path is not keeping the flag in step
          — investigate rather than wait.
        </Alert>
      )}

      {health?.isHealthy && (
        <Alert tone="success" className="mb-4">
          Visibility invariant holds across all {health.scanned} listings.
        </Alert>
      )}

      {isLoading && <Skeleton className="h-64" />}

      {overview && (
        <>
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-muted">Moderation health</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Companies waiting"
                value={moderation?.verification.pendingNow ?? 0}
                hint={
                  moderation?.verification.oldestPendingWaitHours
                    ? `Oldest: ${moderation.verification.oldestPendingWaitHours}h`
                    : 'Queue is clear'
                }
                tone={(moderation?.verification.pendingNow ?? 0) > 10 ? 'warning' : 'neutral'}
              />
              {/*
                Median, not mean. One company left over a holiday weekend drags a mean into
                uselessness; the median is what a company submitting today should expect.
              */}
              <StatCard
                label="Median review time"
                value={`${moderation?.verification.medianReviewHours ?? 0}h`}
                hint={`Mean ${moderation?.verification.avgReviewHours ?? 0}h`}
                tone={(moderation?.verification.medianReviewHours ?? 0) > 48 ? 'warning' : 'success'}
              />
              <StatCard
                label="Jobs waiting"
                value={moderation?.moderation.pendingNow ?? 0}
                tone={(moderation?.moderation.pendingNow ?? 0) > 20 ? 'warning' : 'neutral'}
              />
              <StatCard
                label="Revisions reviewed"
                value={moderation?.moderation.revisionsReviewed ?? 0}
                hint="Approved then edited — the fraud vector"
              />
            </div>
          </section>

          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-muted">Trust</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Live jobs"
                value={overview.jobs.live}
                hint="All from verified companies"
                tone="success"
              />
              <StatCard label="Verified companies" value={overview.employers.verified} />
              <StatCard
                label="Companies rejected"
                value={overview.trust.companiesRejected}
                hint="Kept off the platform"
                tone="danger"
              />
              <StatCard
                label="Listings rejected"
                value={overview.trust.jobsRejected}
                tone="danger"
              />
            </div>
          </section>

          {moderation?.oldestPending?.length > 0 && (
            <Card className="mb-6">
              <h2 className="mb-3 text-sm font-semibold">Waiting longest</h2>
              <ul className="divide-y divide-border">
                {moderation.oldestPending.map((company) => (
                  <li key={company.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="truncate">{company.companyName}</span>
                    <span
                      className={cn(
                        'tabular-nums',
                        company.waitingHours > 48 ? 'font-medium text-warn-600' : 'text-muted',
                      )}
                    >
                      {company.waitingHours}h
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {users?.series && (
            <Card className="mb-6">
              <h2 className="mb-3 text-sm font-semibold">Signups</h2>
              <BarChart
                data={users.series}
                keys={['CANDIDATE', 'EMPLOYER']}
                colors={['rgb(37 99 235)', 'rgb(5 150 105)']}
              />
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 text-sm font-semibold">Application funnel</h2>
              <dl className="space-y-2">
                {Object.entries(overview.applications)
                  .filter(([key]) => APPLICATION_STATUS_META[key])
                  .map(([status, count]) => (
                    <div key={status} className="flex items-center gap-3">
                      <dt className="w-28 shrink-0 text-sm text-muted">
                        {APPLICATION_STATUS_META[status].label}
                      </dt>
                      <dd className="flex-1">
                        <div className="h-2 rounded-full bg-elevated">
                          <div
                            className="h-2 rounded-full bg-brand-500"
                            style={{
                              width: `${percent(count, overview.applications.total)}%`,
                            }}
                          />
                        </div>
                      </dd>
                      <span className="w-10 text-right text-sm tabular-nums">{count}</span>
                    </div>
                  ))}
              </dl>
            </Card>

            <Card>
              <h2 className="mb-3 text-sm font-semibold">Approval rates</h2>
              <dl className="space-y-3 text-sm">
                <Rate
                  label="Companies approved"
                  value={moderation?.verification.approvalRate ?? 0}
                  detail={`${moderation?.verification.approved ?? 0} of ${moderation?.verification.decided ?? 0}`}
                />
                <Rate
                  label="Listings approved"
                  value={moderation?.moderation.approvalRate ?? 0}
                  detail={`${moderation?.moderation.approved ?? 0} of ${moderation?.moderation.decided ?? 0}`}
                />
              </dl>
              {/*
                A very high approval rate is worth questioning, not celebrating: it can mean
                the queue is being rubber-stamped rather than that submissions are good.
              */}
              {(moderation?.verification.approvalRate ?? 0) > 95 &&
                (moderation?.verification.decided ?? 0) > 20 && (
                  <Alert tone="warning" className="mt-3">
                    Almost nothing is being rejected. Worth spot-checking recent approvals.
                  </Alert>
                )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

/**
 * A stacked bar chart in plain SVG.
 *
 * Zero-height bars still render a 1px sliver so a quiet day reads as "zero" rather than as a
 * gap in the data — the same reason the server zero-fills the series.
 */
const BarChart = ({ data, keys, colors }) => {
  const max = Math.max(...data.map((d) => keys.reduce((sum, k) => sum + (d[k] ?? 0), 0)), 1);

  return (
    <div className="flex h-32 items-end gap-px" role="img" aria-label="Signups over time">
      {data.map((point) => (
        <div key={point.date} className="group relative flex-1" title={`${point.date}: ${point.total}`}>
          <div className="flex h-32 flex-col justify-end">
            {keys.map((key, index) => (
              <div
                key={key}
                style={{
                  height: `${((point[key] ?? 0) / max) * 100}%`,
                  backgroundColor: colors[index],
                  minHeight: point[key] ? '2px' : '0',
                }}
              />
            ))}
            <div className="h-px bg-border" />
          </div>
        </div>
      ))}
    </div>
  );
};

const Rate = ({ label, value, detail }) => (
  <div>
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}%</dd>
    </div>
    <div className="mt-1 h-1.5 rounded-full bg-elevated">
      <div className="h-1.5 rounded-full bg-accent-600" style={{ width: `${value}%` }} />
    </div>
    <p className="mt-0.5 text-xs text-muted">{detail}</p>
  </div>
);

const percent = (value, total) => (total ? Math.round((value / total) * 100) : 0);

export default Analytics;
