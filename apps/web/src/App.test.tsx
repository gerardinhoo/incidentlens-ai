import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { renderWithRouter } from './test/renderWithRouter';

const getIncidentByIdMock = vi.hoisted(() => vi.fn());

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getIncidentById: getIncidentByIdMock,
  };
});

describe('App', () => {
  afterEach(() => {
    getIncidentByIdMock.mockReset();
  });

  it('renders the application shell', () => {
    renderWithRouter(<App />, { initialEntries: ['/incidents'] });

    expect(screen.getByText('IncidentLens AI')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Primary' }),
    ).toBeInTheDocument();
  });

  it('renders navigation to Incidents', () => {
    renderWithRouter(<App />, { initialEntries: ['/incidents'] });

    expect(screen.getByRole('link', { name: 'Incidents' })).toBeInTheDocument();
  });

  it('renders the incidents route', () => {
    renderWithRouter(<App />, { initialEntries: ['/incidents'] });

    expect(
      screen.getByRole('heading', { name: 'Incidents' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Incident data will appear here.'),
    ).toBeInTheDocument();
  });

  it('redirects / to /incidents', () => {
    renderWithRouter(<App />, { initialEntries: ['/'] });

    expect(
      screen.getByRole('heading', { name: 'Incidents' }),
    ).toBeInTheDocument();
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
