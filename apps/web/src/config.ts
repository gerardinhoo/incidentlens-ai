const DEFAULT_API_BASE_URL = 'http://localhost:3000';

/** Subset of Vite env used by frontend config (keeps tests injectable). */
export type ApiEnv = Pick<ImportMetaEnv, 'VITE_API_BASE_URL'>;

/**
 * Normalize an API base URL by trimming whitespace and removing a trailing slash.
 */
export function normalizeApiBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('API base URL must not be empty');
  }
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

/**
 * Resolve the backend API base URL from Vite env, with a local development default.
 *
 * Set `VITE_API_BASE_URL` in `.env` / `.env.local` (see `.env.example`).
 * Do not scatter `import.meta.env` usage through components — use this module.
 */
export function getApiBaseUrl(env: ApiEnv = import.meta.env): string {
  const configured = env.VITE_API_BASE_URL;
  if (configured === undefined || configured.trim().length === 0) {
    return DEFAULT_API_BASE_URL;
  }
  return normalizeApiBaseUrl(configured);
}

export const config = {
  get apiBaseUrl(): string {
    return getApiBaseUrl();
  },
} as const;
