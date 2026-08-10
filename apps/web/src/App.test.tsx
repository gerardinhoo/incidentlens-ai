import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { renderWithRouter } from './test/renderWithRouter';

const getIncidentsMock = vi.hoisted(() => vi.fn());

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getIncidents: getIncidentsMock,
  };
});

describe('App', () => {
  afterEach(() => {
    getIncidentsMock.mockReset();
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
    expect(await screen.findByText('No incidents found.')).toBeInTheDocument();
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

  it('renders the incident details route with the id', () => {
    renderWithRouter(<App />, {
      initialEntries: ['/incidents/inc-123'],
    });

    expect(
      screen.getByRole('heading', { name: 'Incident details' }),
    ).toBeInTheDocument();
    expect(screen.getByText('inc-123')).toBeInTheDocument();
  });
});
