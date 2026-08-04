/**
 * Client environment.
 *
 * Vite inlines `import.meta.env.*` at build time, so these are baked into the bundle and
 * are public by definition. Nothing secret belongs here — no API keys, no tokens.
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';
export const IS_DEV = import.meta.env.DEV;
export const IS_PROD = import.meta.env.PROD;
export const ENABLE_QUERY_DEVTOOLS = IS_DEV;
