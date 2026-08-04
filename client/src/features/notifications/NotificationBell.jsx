import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationApi } from '../../api/services/index.js';
import { cn } from '../../utils/cn.js';

/**
 * The notification bell.
 *
 * ★ The badge count and the list are separate queries on purpose. The count is polled every
 * 60 seconds by every signed-in tab; fetching a page of documents to render a number would
 * be twenty times the payload for none of the information. The list is fetched only when the
 * panel opens.
 */
export const NotificationBell = () => {
  const [isOpen, setOpen] = useState(false);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ['notifications', 'summary'],
    queryFn: notificationApi.summary,
    refetchInterval: 60_000,
    // Polling while the tab is hidden burns the user's battery and our rate limit to
    // update a badge nobody is looking at.
    refetchIntervalInBackground: false,
  });

  const { data: page, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => notificationApi.list({ limit: 10 }),
    enabled: isOpen,
  });

  const markAllRead = useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markRead = useMutation({
    mutationFn: notificationApi.markRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  /** Close on outside click and on Escape — both, because either alone feels broken. */
  useEffect(() => {
    if (!isOpen) return undefined;

    const onPointerDown = (event) => {
      if (
        !panelRef.current?.contains(event.target) &&
        !buttonRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus(); // return focus, or the keyboard user is stranded
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const unread = summary?.unread ?? 0;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((open) => !open)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="relative rounded-md p-2 text-muted transition-colors hover:bg-elevated hover:text-ink"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path
            d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {unread > 0 && (
          <span
            className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger-500 px-1 text-[10px] font-bold text-white"
            // The button's aria-label already says the count; repeating it here makes a
            // screen reader announce the number twice.
            aria-hidden="true"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-40 mt-2 w-80 origin-top-right animate-slide-up overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-lg)] sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h2 className="text-sm font-semibold text-ink">Notifications</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="text-xs font-medium text-brand-500 hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading && <p className="p-4 text-sm text-muted">Loading…</p>}

            {!isLoading && !page?.items.length && (
              <p className="p-6 text-center text-sm text-muted">
                Nothing yet. We&apos;ll let you know when something happens.
              </p>
            )}

            {page?.items.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onOpen={() => {
                  if (!notification.isRead) markRead.mutate(notification.id);
                  setOpen(false);
                }}
              />
            ))}
          </div>

          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-brand-500 hover:bg-elevated"
          >
            See all
          </Link>
        </div>
      )}
    </div>
  );
};

const NotificationRow = ({ notification, onOpen }) => {
  /*
   * A row with a link is a real `<Link>`; one without is a plain `<div>`. Rendering an
   * `<a href="#">` for an unlinked notification would put it in the tab order and promise a
   * navigation that does not exist.
   *
   * The component and its props are cast together because the union of `Link | 'div'` has no
   * common props type — `to` is meaningless on a div and TypeScript cannot narrow the pair.
   */
  const Wrapper = /** @type {any} */ (notification.link ? Link : 'div');
  const wrapperProps = notification.link ? { to: notification.link, onClick: onOpen } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        'flex gap-3 border-b border-border px-4 py-3 last:border-0',
        notification.link && 'hover:bg-elevated',
        // Unread is marked by a tint AND a dot — colour alone is not a signal everyone can see.
        !notification.isRead && 'bg-brand-50/50 dark:bg-brand-900/20',
      )}
    >
      <span
        className={cn(
          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
          notification.isRead ? 'bg-transparent' : 'bg-brand-500',
        )}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{notification.title}</p>
        {notification.body && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{notification.body}</p>
        )}
        <p className="mt-1 text-[11px] text-muted">{relativeTime(notification.createdAt)}</p>
      </div>
    </Wrapper>
  );
};

/**
 * Relative time, in the user's locale.
 *
 * `Intl.RelativeTimeFormat` is built in — a date library for this one string would be
 * several kilobytes on the critical path of every signed-in page.
 *
 * @param {string} iso
 */
const relativeTime = (iso) => {
  const diffMs = new Date(iso).getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  /**
   * Annotated because a bare array of mixed tuples infers as `(string|number)[][]`, which
   * makes `unit` a `string|number` and rejects it as an `Intl` unit. The runtime values were
   * always right; this tells the checker what the pairs are.
   *
   * @type {Array<[Intl.RelativeTimeFormatUnit, number]>}
   */
  const UNITS = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];

  for (const [unit, ms] of UNITS) {
    if (Math.abs(diffMs) >= ms) return formatter.format(Math.round(diffMs / ms), unit);
  }
  return 'just now';
};

export default NotificationBell;
