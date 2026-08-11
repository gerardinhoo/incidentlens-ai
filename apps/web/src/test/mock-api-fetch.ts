import { vi } from 'vitest';

type ListHandler = () => unknown;
type ByIdHandler = (id: string) => unknown;

export type MockApiHandlers = {
  list?: ListHandler;
  byId?: ByIdHandler;
};

function toResponse(body: unknown, status = 200): Response {
  if (body instanceof Response) {
    return body;
  }
  return Response.json(body, { status });
}

function parseUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) {
    return input;
  }
  if (typeof input === 'string') {
    return new URL(input, 'http://localhost');
  }
  return new URL(input.url, 'http://localhost');
}

/**
 * Mock fetch at the HTTP boundary for integration tests.
 * Routes GET /api/incidents and GET /api/incidents/:id (Vite proxy base).
 */
export function installMockApiFetch(handlers: MockApiHandlers = {}) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = parseUrl(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = url.pathname;

      if (method === 'GET' && path === '/api/incidents') {
        if (handlers.list === undefined) {
          throw new Error('Unexpected GET /api/incidents — no list handler');
        }
        return toResponse(await handlers.list());
      }

      const detailMatch = /^\/api\/incidents\/([^/]+)$/.exec(path);
      if (method === 'GET' && detailMatch?.[1] !== undefined) {
        if (handlers.byId === undefined) {
          throw new Error(
            `Unexpected GET /api/incidents/${detailMatch[1]} — no byId handler`,
          );
        }
        const id = decodeURIComponent(detailMatch[1]);
        return toResponse(await handlers.byId(id));
      }

      throw new Error(`Unhandled fetch: ${method} ${path}`);
    },
  );

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function uninstallMockApiFetch() {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}
