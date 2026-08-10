import { config } from '../config';
import { ApiError, toApiError } from './api-error';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type HttpRequestOptions = {
  method?: HttpMethod;
  /** JSON-serializable body; Content-Type is set only when present. */
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Override for tests; defaults to config.apiBaseUrl. */
  baseUrl?: string;
  /** Override for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

function joinApiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

async function readBodySafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Small JSON-oriented fetch wrapper for the IncidentLens API.
 * Uses `config.apiBaseUrl`; does not log request or response bodies.
 */
export async function httpRequest<T>(
  path: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? config.apiBaseUrl;

  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const init: RequestInit = {
    method,
    headers,
  };

  if (options.signal !== undefined) {
    init.signal = options.signal;
  }

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const url = joinApiUrl(baseUrl, path);

  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError(0, 'Unable to reach the API. Please try again.');
  }

  const parsed = await readBodySafely(response);

  if (!response.ok) {
    throw toApiError(response.status, parsed);
  }

  if (parsed === undefined) {
    throw new ApiError(
      response.status,
      'Received an empty or invalid API response',
    );
  }

  return parsed as T;
}
