import { vi } from 'vitest';

type ListHandler = () => unknown;
type ByIdHandler = (id: string) => unknown;
type UpdateStatusHandler = (
  id: string,
  status: string,
  body: unknown,
) => unknown;

export type MockApiHandlers = {
  list?: ListHandler;
  byId?: ByIdHandler;
  updateStatus?: UpdateStatusHandler;
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

      const statusMatch = /^\/api\/incidents\/([^/]+)\/status$/.exec(path);
      if (method === 'PATCH' && statusMatch?.[1] !== undefined) {
        if (handlers.updateStatus === undefined) {
          throw new Error(
            `Unexpected PATCH /api/incidents/${statusMatch[1]}/status — no updateStatus handler`,
          );
        }
        const id = decodeURIComponent(statusMatch[1]);
        let body: unknown;
        try {
          body =
            typeof init?.body === 'string'
              ? (JSON.parse(init.body) as unknown)
              : undefined;
        } catch {
          body = undefined;
        }
        let statusValue = '';
        if (body !== null && typeof body === 'object' && 'status' in body) {
          const candidate = Reflect.get(body, 'status');
          if (typeof candidate === 'string') {
            statusValue = candidate;
          }
        }
        return toResponse(await handlers.updateStatus(id, statusValue, body));
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
