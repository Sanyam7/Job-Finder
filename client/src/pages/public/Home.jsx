import { Link } from 'react-router-dom';
import { BRAND } from '@verihire/shared';
import { ROUTES } from '../../routes/paths.js';

const STEPS = [
  { n: 1, title: 'Employer registers', body: 'Any company can create an account.' },
  { n: 2, title: 'Admin verifies', body: 'A human checks documents, domain and identity.' },
  { n: 3, title: 'Job reviewed', body: 'Every listing is read individually before publishing.' },
  { n: 4, title: 'Job goes live', body: 'Only then can a candidate see or apply to it.' },
];

export const Home = () => (
  <main className="mx-auto max-w-5xl px-6 py-20">
    <section className="text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-accent-300 bg-accent-50 px-3 py-1 text-sm font-medium text-accent-700 dark:bg-accent-500/10">
        <span aria-hidden="true">✅</span> Every employer verified by a human
      </span>

      <h1 className="mt-6 text-display font-bold tracking-tight">
        Find real jobs.
        <br />
        From real companies.
      </h1>

      <p className="mx-auto mt-5 max-w-xl text-lg text-muted">{BRAND.description}</p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          to={ROUTES.JOBS}
          className="rounded-md bg-brand-500 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-brand-600"
        >
          Browse verified jobs
        </Link>
        <Link
          to={ROUTES.SIGNUP}
          className="rounded-md border border-border px-5 py-2.5 font-semibold transition-colors hover:bg-elevated"
        >
          Post a job
        </Link>
      </div>
    </section>

    <section className="mt-24" aria-labelledby="how-it-works">
      <h2 id="how-it-works" className="text-center text-2xl font-bold">
        How a job reaches you
      </h2>

      <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <li key={step.n} className="card p-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
              {step.n}
            </span>
            <h3 className="mt-4 font-semibold">{step.title}</h3>
            <p className="mt-1 text-sm text-muted">{step.body}</p>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-center text-sm text-muted">
        No listing is ever public without passing both checks.
      </p>
    </section>
  </main>
);

export default Home;
