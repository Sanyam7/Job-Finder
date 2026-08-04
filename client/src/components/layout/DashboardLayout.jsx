import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks.js';
import { BRAND } from '@verihire/shared';
import { cn } from '../../utils/cn.js';
import { NotificationBell } from '../../features/notifications/NotificationBell.jsx';
import { UserMenu } from './UserMenu.jsx';

/**
 * The shell for all three signed-in portals.
 *
 * One layout rather than three: the chrome is identical and only `nav` differs, so a change
 * to the header — a new notification affordance, a skip link, a keyboard shortcut — lands
 * everywhere at once instead of in two places out of three.
 */

/**
 * `end` marks the portal root, so /candidate/applications does not highlight both "Dashboard"
 * and "Applications".
 *
 * @param {{nav: {to: string, label: string, icon?: React.ReactNode, badge?: number,
 *            end?: boolean}[],
 *          portalLabel: string, banner?: React.ReactNode}} props
 */
export const DashboardLayout = ({ nav = [], portalLabel, banner }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const user = useAppSelector((state) => state.auth.user);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-bg">
      {/*
        A skip link is the difference between "tab past 12 nav items on every page" and a
        usable keyboard experience. It is visually hidden until focused.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Toggle navigation"
            aria-expanded={isSidebarOpen}
            className="rounded-md p-2 text-muted hover:bg-elevated lg:hidden"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>

          <NavLink to="/" className="flex items-center gap-2 font-bold text-ink">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-500 text-sm text-white">
              V
            </span>
            <span className="hidden sm:inline">{BRAND.name}</span>
          </NavLink>

          <span className="hidden rounded-full bg-elevated px-2 py-0.5 text-xs text-muted sm:inline">
            {portalLabel}
          </span>

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <UserMenu user={user} />
          </div>
        </div>

        {banner}
      </header>

      <div className="flex">
        {/* Backdrop closes the drawer on mobile. */}
        {isSidebarOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          />
        )}

        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-20 w-64 shrink-0 border-r border-border bg-surface pt-14',
            'transition-transform duration-200 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 lg:pt-0',
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <nav className="space-y-1 p-3" aria-label={`${portalLabel} navigation`}>
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                // `end` on the portal root only, so /candidate/applications does not
                // highlight both "Dashboard" and "Applications".
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                      : 'text-muted hover:bg-elevated hover:text-ink',
                  )
                }
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
                {item.badge > 0 && (
                  <span className="ml-auto rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 lg:px-8">
          {/*
            Keyed on pathname so React remounts the subtree on navigation. Without it a
            stale scroll position and stale form state survive a route change, which reads
            as the app showing the wrong page for a beat.
          */}
          <div key={location.pathname} className="mx-auto max-w-6xl animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
