import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes/paths.js';
import { cn } from '../../utils/cn.js';

/**
 * The frame every authentication screen sits in.
 *
 * Extracted because five screens sharing a layout by copy-paste is how one of them ends up
 * with a different max-width and a missing `<main>` landmark six months later.
 *
 * `<main>` is a real landmark and the heading is a real `<h1>`: these pages are frequently
 * the first thing a screen-reader user lands on from an email link, with no navigation
 * before it to orient them.
 *
 * @param {{title: string, description?: React.ReactNode, children: React.ReactNode,
 *          footer?: React.ReactNode, width?: 'sm'|'md'}} props
 */
export const AuthShell = ({ title, description, children, footer, width = 'sm' }) => (
  <main
    className={cn(
      'mx-auto flex min-h-screen flex-col justify-center px-6 py-12',
      width === 'md' ? 'max-w-lg' : 'max-w-md',
    )}
  >
    <Link
      to={ROUTES.HOME}
      className="mb-8 inline-flex w-fit items-center gap-2 text-lg font-bold text-ink"
    >
      <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-500 text-sm text-white">
        V
      </span>
      VeriHire
    </Link>

    <h1 className="text-2xl font-bold text-ink">{title}</h1>
    {description && <div className="mt-1.5 text-sm text-muted">{description}</div>}

    <div className="mt-8">{children}</div>

    {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
  </main>
);

export default AuthShell;
