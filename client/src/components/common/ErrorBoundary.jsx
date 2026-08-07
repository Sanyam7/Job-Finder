import React from 'react';

/**
 * ★ The app had none of these, and the cost was severe.
 *
 * React 18 unmounts the entire tree when a render throws with nothing above it to catch —
 * so any error in any component produced a blank page showing only the background colour,
 * with no message, no navigation and no way back except a manual reload. A single broken
 * field in one section took down the whole product, and it looked to the user like the site
 * had simply stopped existing.
 *
 * ★ Stale chunks are treated as their own case, because they are not really errors.
 *
 * Vite fingerprints its chunks, so every deploy renames them. A tab left open across a
 * deploy still holds the previous index, and the first lazy route it visits asks for a chunk
 * that is no longer there. Nothing is wrong with the code — the user is simply running a
 * build that has been replaced — so the honest response is "reload to get the new version",
 * not an apology for a crash. Telling those apart matters: an apology invites a bug report
 * for something a refresh fixes.
 *
 * Class component because `componentDidCatch` has no hook equivalent; this is the one place
 * React still requires one.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept as console.error rather than swallowed: without a reporting service this is the
    // only record that survives, and a boundary that hides the stack is worse than none.
    console.error('Unhandled error caught by boundary:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (isStaleChunkError(error)) {
      return (
        <Shell
          title="A new version is available"
          body="This page was updated while you had it open. Reload to continue — nothing you have saved is affected."
          actionLabel="Reload"
          onAction={() => window.location.reload()}
        />
      );
    }

    return (
      <Shell
        title="Something went wrong on this page"
        body="The rest of the app is still working. You can go back, or reload this page to try again."
        actionLabel="Reload this page"
        onAction={() => window.location.reload()}
        secondary={
          <button
            type="button"
            onClick={() => window.history.back()}
            className="text-sm font-medium text-brand-500 hover:underline"
          >
            Go back
          </button>
        }
      />
    );
  }
}

/**
 * A failed dynamic import, across the wording the major browsers use.
 *
 * Matched on the message because there is no error type to check: a rejected `import()`
 * surfaces as a plain TypeError, and each engine words it differently. Firefox and Safari
 * mention the module or its MIME type, Chrome says it failed to fetch.
 *
 * @param {unknown} error
 */
const isStaleChunkError = (error) => {
  const message = String(/** @type {any} */ (error)?.message ?? error ?? '');
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /expected a JavaScript(-or-Wasm)? module/i.test(message) ||
    /'text\/html' is not a valid JavaScript MIME type/i.test(message)
  );
};

/**
 * Annotated because a destructured prop is inferred as required, which would make the
 * stale-chunk branch — the one with no secondary action — a type error.
 *
 * @param {{title: string, body: string, actionLabel: string, onAction: () => void,
 *          secondary?: React.ReactNode}} props
 */
const Shell = ({ title, body, actionLabel, onAction, secondary = null }) => (
  <main
    role="alert"
    className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center"
  >
    <h1 className="text-lg font-semibold text-ink">{title}</h1>
    <p className="mt-2 text-sm text-muted">{body}</p>
    <div className="mt-6 flex items-center gap-4">
      <button
        type="button"
        onClick={onAction}
        className="inline-flex h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
      >
        {actionLabel}
      </button>
      {secondary}
    </div>
  </main>
);

export default ErrorBoundary;
