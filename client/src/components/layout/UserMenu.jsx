import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { getInitials, ROLES } from '@verihire/shared';
import { useAppSelector } from '../../app/hooks.js';
import { useQueryClient } from '@tanstack/react-query';
import { clearCredentials } from '../../features/auth/slices/authSlice.js';
import { setTheme } from '../../features/ui/slices/uiSlice.js';
import { authApi } from '../../api/services/auth.api.js';
import { cn } from '../../utils/cn.js';

/** Where each role's settings live. */
const SETTINGS_PATH = {
  [ROLES.CANDIDATE]: '/candidate/settings',
  [ROLES.EMPLOYER]: '/employer/settings',
  [ROLES.ADMIN]: '/admin/settings',
};

export const UserMenu = ({ user }) => {
  const [isOpen, setOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const theme = useAppSelector((state) => state.ui.theme);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  if (!user) return null;

  /**
   * ★ Local state is cleared whether or not the server call succeeds.
   *
   * If the network is down, "sign out" must still sign you out of this browser — leaving a
   * user apparently signed in on a shared machine because a request failed is the worse
   * outcome by a wide margin. The refresh cookie is revoked server-side when it can be, and
   * the access token was only ever in memory.
   */
  const handleLogout = async () => {
    setOpen(false);
    try {
      await authApi.logout();
    } catch {
      // Intentionally ignored — see above.
    }
    dispatch(clearCredentials());
    // Every cached query belongs to the account that just left.
    queryClient.clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((open) => !open)}
        aria-label="Account menu"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-elevated"
      >
        <Avatar user={user} />
        <span className="hidden max-w-24 truncate text-sm font-medium text-ink sm:inline">
          {user.firstName}
        </span>
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 origin-top-right animate-slide-up overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-lg)]"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-medium text-ink">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>

          <div className="p-1">
            <MenuLink to={SETTINGS_PATH[user.role] ?? '/'} onClick={() => setOpen(false)}>
              Settings
            </MenuLink>

            <button
              type="button"
              role="menuitem"
              onClick={() => dispatch(setTheme(theme === 'dark' ? 'light' : 'dark'))}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-ink hover:bg-elevated"
            >
              Theme
              <span className="text-xs text-muted">{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </button>
          </div>

          <div className="border-t border-border p-1">
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="w-full rounded-md px-3 py-2 text-left text-sm text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-500/10"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const MenuLink = ({ to, onClick, children }) => (
  <Link
    to={to}
    role="menuitem"
    onClick={onClick}
    className="block rounded-md px-3 py-2 text-sm text-ink hover:bg-elevated"
  >
    {children}
  </Link>
);

/**
 * Initials fallback rather than a stock silhouette.
 *
 * Most users never upload a photo; a grey person icon on every row makes the whole product
 * look unpopulated, while initials look intentional.
 */
const Avatar = ({ user, size = 'h-7 w-7' }) =>
  user.avatar ? (
    <img src={user.avatar} alt="" className={cn(size, 'rounded-full object-cover')} />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        size,
        'grid place-items-center rounded-full bg-brand-500 text-xs font-semibold text-white',
      )}
    >
      {getInitials(user.firstName, user.lastName)}
    </span>
  );

export default UserMenu;
