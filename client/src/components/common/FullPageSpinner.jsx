/**
 * Shown while the session is being recovered from the refresh cookie on a hard reload.
 * `role="status"` + `aria-live` so a screen reader announces the wait instead of silence.
 */
export const FullPageSpinner = ({ label = 'Loading' }) => (
  <div
    className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4"
    role="status"
    aria-live="polite"
  >
    <span
      className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-brand-500 motion-reduce:animate-none"
      aria-hidden="true"
    />
    <span className="text-sm text-muted">{label}…</span>
  </div>
);

export default FullPageSpinner;
