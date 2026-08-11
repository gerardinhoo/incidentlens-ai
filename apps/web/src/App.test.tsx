import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { renderWithRouter } from './test/renderWithRouter';

const getIncidentsMock = vi.hoisted(() => vi.fn());
const getIncidentByIdMock = vi.hoisted(() => vi.fn());

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getIncidents: getIncidentsMock,
    getIncidentById: getIncidentByIdMock,
  };
});

describe('App', () => {
  afterEach(() => {
    getIncidentsMock.mockReset();
    getIncidentByIdMock.mockReset();
  });

  it('renders the application shell', async () => {
    getIncidentsMock.mockResolvedValue([]);

    renderWithRouter(<App />, { initialEntries: ['/incidents'] });

    expect(screen.getByText('IncidentLens AI')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Primary' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(getIncidentsMock).toHaveBeenCalled();
    });
  });

  it('renders navigation to Incidents', async () => {
    getIncidentsMock.mockResolvedValue([]);

    renderWithRouter(<App />, { initialEntries: ['/incidents'] });

    expect(screen.getByRole('link', { name: 'Incidents' })).toBeInTheDocument();
    await waitFor(() => {
      expect(getIncidentsMock).toHaveBeenCalled();
    });
  });

  it('renders the incidents route', async () => {
    getIncidentsMock.mockResolvedValue([]);

    renderWithRouter(<App />, { initialEntries: ['/incidents'] });

    expect(
      screen.getByRole('heading', { name: 'Incidents' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'No incidents detected' }),
    ).toBeInTheDocument();
  });

  it('redirects / to /incidents', async () => {
    getIncidentsMock.mockResolvedValue([]);

    renderWithRouter(<App />, { initialEntries: ['/'] });

    expect(
      screen.getByRole('heading', { name: 'Incidents' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(getIncidentsMock).toHaveBeenCalled();
    });
  });

  it('renders the incident details route with fetched incident', async () => {
    getIncidentByIdMock.mockResolvedValue({
      id: 'inc-123',
      title: 'Checkout timeouts',
      source: 'checkout-api',
      severity: 'high',
      status: 'open',
      errorType: 'TimeoutError',
      metadata: {},
      createdAt: '2026-08-10T15:30:00.000Z',
      updatedAt: '2026-08-10T15:30:00.000Z',
    });

    renderWithRouter(<App />, {
      initialEntries: ['/incidents/inc-123'],
    });

    expect(
      await screen.findByRole('heading', { name: 'Checkout timeouts' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(getIncidentByIdMock).toHaveBeenCalledWith(
        'inc-123',
        expect.any(AbortSignal),
      );
    });
  });
});
