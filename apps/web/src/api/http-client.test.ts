import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-error';
import { httpRequest } from './http-client';

describe('httpRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('joins base URL and path without a double slash', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(Response.json({ ok: true }, { status: 200 })),
    );

    await httpRequest('/incidents', {
      baseUrl: 'https://api.example.com/',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/incidents',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('supports relative proxy base URLs', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(Response.json([], { status: 200 })),
    );

    await httpRequest('/incidents', {
      baseUrl: '/api',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/incidents',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('sets Content-Type only when a body is present', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ id: '1' }, { status: 201 })),
    );

    await httpRequest('/incidents', {
      method: 'POST',
      body: { title: 'x' },
      baseUrl: '/api',
      fetchImpl,
    });

    const postInit = fetchImpl.mock.calls[0]?.[1];
    expect(postInit).toBeDefined();
    const headers = new Headers(postInit?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');

    fetchImpl.mockClear();
    fetchImpl.mockResolvedValueOnce(Response.json([], { status: 200 }));

    await httpRequest('/incidents', { baseUrl: '/api', fetchImpl });
    const getInit = fetchImpl.mock.calls[0]?.[1];
    expect(getInit).toBeDefined();
    const getHeaders = new Headers(getInit?.headers);
    expect(getHeaders.get('Content-Type')).toBeNull();
  });

  it('passes AbortSignal through to fetch', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(() =>
      Promise.resolve(Response.json([], { status: 200 })),
    );

    await httpRequest('/incidents', {
      baseUrl: '/api',
      fetchImpl,
      signal: controller.signal,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/incidents',
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('throws a safe ApiError for 500 responses', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response('Internal Server Error', { status: 500 })),
    );

    await expect(
      httpRequest('/incidents', { baseUrl: '/api', fetchImpl }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'Something went wrong. Please try again.',
    } satisfies Partial<ApiError>);
  });

  it('does not crash when an error body is malformed JSON', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response('{not-json', {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(
      httpRequest('/incidents', { baseUrl: '/api', fetchImpl }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('throws when a success body is empty or invalid JSON', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response('not-json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(
      httpRequest('/incidents', { baseUrl: '/api', fetchImpl }),
    ).rejects.toMatchObject({
      status: 200,
      message: 'Received an empty or invalid API response',
    });
  });
});
