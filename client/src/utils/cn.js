/**
 * Conditional class names.
 *
 * Deliberately not `tailwind-merge`: that package resolves conflicting utilities
 * (`p-2 p-4` → `p-4`) at a cost of ~6 kB gzipped and a full parse of every class string on
 * every render. The components here are written so conflicts do not arise — a variant owns
 * its padding and the caller's `className` is appended last, which CSS resolves anyway when
 * specificity is equal. Revisit only if a real conflict appears.
 *
 * @param {...(string|false|null|undefined|Record<string, boolean>)} inputs
 * @returns {string}
 */
export const cn = (...inputs) => {
  const out = [];

  for (const input of inputs) {
    if (!input) continue;

    if (typeof input === 'string') {
      out.push(input);
    } else if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) if (value) out.push(key);
    }
  }

  return out.join(' ');
};

export default cn;
