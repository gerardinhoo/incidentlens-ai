import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-error';
import {
  createIncident,
  getIncidentById,
  getIncidents,
  updateIncidentStatus,
} from './incidents';

const sampleIncident = {
  id: 'inc-123',
  title: 'API down',
  source: 'demo-api',
  severity: 'high' as const,
  status: 'open' as const,
  errorType: 'TimeoutError',
  metadata: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('incidents API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('getIncidents calls GET /incidents and returns IncidentDto[]', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(Response.json([sampleIncident], { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getIncidents();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/incidents',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual([sampleIncident]);
  });

  it('getIncidents returns an empty array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json([], { status: 200 }))),
    );

    await expect(getIncidents()).resolves.toEqual([]);
  });

  it('getIncidentById encodes the incident id in the path', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(Response.json(sampleIncident, { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getIncidentById('id/with spaces');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/incidents/id%2Fwith%20spaces',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual(sampleIncident);
  });

  it('getIncidentById throws ApiError on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            { status: 'error', message: 'Incident not found' },
            { status: 404 },
          ),
        ),
      ),
    );

    await expect(getIncidentById('missing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Incident not found',
    } satisfies Partial<ApiError>);
  });

  it('createIncident sends POST with JSON body and accepts 201', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(Response.json(sampleIncident, { status: 201 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const input = {
      title: 'API down',
      source: 'demo-api',
      severity: 'high' as const,
      errorType: 'TimeoutError',
    };

    const result = await createIncident(input);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/incidents',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
    expect(result).toEqual(sampleIncident);
  });

  it('updateIncidentStatus sends PATCH with encoded URL and status body', async () => {
    const updated = {
      ...sampleIncident,
      status: 'investigating' as const,
    };
    const fetchMock = vi.fn(() =>
      Promise.resolve(Response.json(updated, { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await updateIncidentStatus('inc/42', 'investigating');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/incidents/inc%2F42/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'investigating' }),
      }),
    );
    expect(result).toEqual(updated);
  });

  it('updateIncidentStatus throws ApiError on 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            {
              status: 'error',
              message: 'Invalid incident status transition',
            },
            { status: 409 },
          ),
        ),
      ),
    );

    await expect(updateIncidentStatus('inc-123', 'open')).rejects.toMatchObject(
      {
        name: 'ApiError',
        status: 409,
        message: 'Invalid incident status transition',
      } satisfies Partial<ApiError>,
    );
  });

  it('passes AbortSignal through getIncidents', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(() =>
      Promise.resolve(Response.json([], { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getIncidents(controller.signal);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/incidents',
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
