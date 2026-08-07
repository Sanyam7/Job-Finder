/**
 * Imports every page and feature module and reports any that fail to evaluate.
 *
 * ★ This exists because a bundler cannot catch this class of bug and neither can a linter.
 *
 * `COLLECTION_SCHEMA` called a `const` arrow function that was declared further down the
 * same file. `const` bindings hoist without initialising, so the call sat in the temporal
 * dead zone and threw the moment the module was evaluated — taking the whole chunk with it,
 * so the candidate profile page rendered nothing at all in production.
 *
 * Nothing in the existing toolchain saw it. `vite build` bundles without executing, `tsc`
 * cannot prove a call inside `.map()` runs eagerly, and `no-use-before-define` flags 137
 * mostly-safe deferred references in this codebase — a signal nobody would keep reading.
 * Actually importing the module is the check that works, because evaluating it is precisely
 * what production does and precisely what was failing.
 *
 * Deliberately does not render anything: mounting components needs a DOM and a single React
 * instance, which is a test-runner's job. This answers the narrower question — does every
 * module still load — in a couple of seconds and with no test framework.
 *
 * Run: npm run smoke --workspace=client
 */
import { createServer } from 'vite';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = ['src/pages', 'src/features', 'src/components', 'src/routes'];

/** @param {string} dir */
const walk = async (dir) => {
  /** @type {string[]} */
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found; // a directory that does not exist is not a failure
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else if (/\.jsx?$/.test(entry.name)) found.push(full);
  }
  return found;
};

const vite = await createServer({
  root: ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});

let failed = 0;
let checked = 0;

try {
  const files = (await Promise.all(SCAN.map((d) => walk(path.join(ROOT, d))))).flat();

  for (const file of files) {
    const specifier = `/${path.relative(ROOT, file).split(path.sep).join('/')}`;
    checked += 1;
    try {
      await vite.ssrLoadModule(specifier);
    } catch (error) {
      failed += 1;
      console.error(`\nFAIL  ${specifier}`);
      console.error(`      ${/** @type {Error} */ (error).message}`);
    }
  }
} finally {
  await vite.close();
}

if (failed) {
  console.error(`\n${failed} of ${checked} modules failed to evaluate.`);
  process.exit(1);
}

console.log(`All ${checked} modules evaluate cleanly.`);
