/**
 * Normalized HTTP / API failure for UI and callers.
 * Never carries raw HTML or large validation dumps.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (code !== undefined) {
      this.code = code;
    }
  }
}

const SAFE_MESSAGE_MAX_LENGTH = 200;

function looksLikeHtml(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.includes('<body')
  );
}

function isSafeUserMessage(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= SAFE_MESSAGE_MAX_LENGTH &&
    !looksLikeHtml(value)
  );
}

function readStringField(body: unknown, key: string): string | undefined {
  if (body === null || typeof body !== 'object' || !(key in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Build a short, UI-safe message from an HTTP status and optional parsed body.
 */
export function normalizeApiErrorMessage(
  status: number,
  body: unknown,
): string {
  if (status === 400) {
    return 'Request validation failed';
  }

  const message = readStringField(body, 'message');
  if (isSafeUserMessage(message)) {
    return message.trim();
  }

  if (status === 404) {
    return 'Incident not found';
  }

  if (status === 409) {
    return 'Invalid incident status transition';
  }

  if (status >= 500) {
    return 'Something went wrong. Please try again.';
  }

  if (status === 0) {
    return 'Unable to reach the API. Please try again.';
  }

  return 'Request failed';
}

export function toApiError(status: number, body: unknown): ApiError {
  const message = normalizeApiErrorMessage(status, body);
  const code = readStringField(body, 'status');
  return code === undefined
    ? new ApiError(status, message)
    : new ApiError(status, message, code);
}

/** True when the failure is an HTTP 404 from the typed API client. */
export function isNotFoundError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 404;
}

/** True when the failure is a typed ApiError (use `.status` for branching). */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
