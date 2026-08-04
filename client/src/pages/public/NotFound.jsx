import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes/paths.js';

export const NotFound = () => (
  <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
    <p className="text-5xl font-bold text-muted">404</p>
    <h1 className="text-2xl font-bold">We couldn&apos;t find that page</h1>
    <p className="text-muted">
      The link may be broken, or the listing may have been archived or removed.
    </p>
    <Link
      to={ROUTES.HOME}
      className="mt-2 rounded-md bg-brand-500 px-5 py-2.5 font-semibold text-white hover:bg-brand-600"
    >
      Back to home
    </Link>
  </main>
);

export default NotFound;
