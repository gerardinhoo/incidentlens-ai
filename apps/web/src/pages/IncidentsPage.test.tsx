import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import type { IncidentDto } from '../types/incident';
import { IncidentsPage } from './IncidentsPage';

const getIncidentsMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    getIncidents: getIncidentsMock,
  };
});

const sampleIncidents: IncidentDto[] = [
  {
    id: 'inc-100',
    title: 'Checkout timeouts',
    source: 'checkout-api',
    severity: 'high',
    status: 'open',
    errorType: 'TimeoutError',
    metadata: {},
    createdAt: '2026-08-10T15:30:00.000Z',
    updatedAt: '2026-08-10T15:30:00.000Z',
  },
  {
    id: 'inc-99',
    title: 'Auth latency',
    source: 'auth-service',
    severity: 'medium',
    status: 'investigating',
    errorType: 'LatencySpike',
    metadata: {},
    createdAt: '2026-08-09T12:00:00.000Z',
    updatedAt: '2026-08-09T12:00:00.000Z',
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <IncidentsPage />
    </MemoryRouter>,
  );
}

describe('IncidentsPage', () => {
  afterEach(() => {
    getIncidentsMock.mockReset();
  });

  it('shows a loading state while incidents are pending', () => {
    getIncidentsMock.mockReturnValue(new Promise(() => undefined));

    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Incidents' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('AI-assisted incident investigation'),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading incidents…');
    expect(
      screen.queryByRole('list', { name: 'Incident summary' }),
    ).not.toBeInTheDocument();
  });

  it('fetches incidents on load', async () => {
    getIncidentsMock.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(getIncidentsMock).toHaveBeenCalledTimes(1);
    });
    expect(getIncidentsMock.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
  });

  it('renders returned incidents with essential fields', async () => {
    getIncidentsMock.mockResolvedValue(sampleIncidents);

    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Checkout timeouts' }),
    ).toBeInTheDocument();
    expect(screen.getByText('checkout-api')).toBeInTheDocument();
    expect(screen.getAllByText('High').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Open').length).toBeGreaterThanOrEqual(1);

    expect(
      screen.getByRole('link', { name: 'Auth latency' }),
    ).toBeInTheDocument();
    expect(screen.getByText('auth-service')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Investigating')).toBeInTheDocument();

    const createdTimes = screen.getAllByRole('time');
    expect(createdTimes).toHaveLength(2);
    expect(createdTimes[0]).toHaveAttribute(
      'dateTime',
      '2026-08-10T15:30:00.000Z',
    );
  });

  it('renders summary metrics derived from the loaded incidents', async () => {
    getIncidentsMock.mockResolvedValue(sampleIncidents);

    renderPage();

    const summary = await screen.findByRole('list', {
      name: 'Incident summary',
    });
    expect(within(summary).getByText('Total')).toBeInTheDocument();
    expect(within(summary).getByText('Critical')).toBeInTheDocument();
    expect(within(summary).getByText('High')).toBeInTheDocument();
    expect(within(summary).getByText('Open')).toBeInTheDocument();
    expect(within(summary).getByText('2')).toBeInTheDocument();
    expect(within(summary).getAllByText('1')).toHaveLength(2);
    expect(within(summary).getByText('0')).toBeInTheDocument();
  });

  it('links each incident to /incidents/:id', async () => {
    getIncidentsMock.mockResolvedValue(sampleIncidents);

    renderPage();

    const first = await screen.findByRole('link', {
      name: 'Checkout timeouts',
    });
    const second = screen.getByRole('link', { name: 'Auth latency' });

    expect(first).toHaveAttribute('href', '/incidents/inc-100');
    expect(second).toHaveAttribute('href', '/incidents/inc-99');
  });

  it('renders analysis indicators for completed, pending, failed, and none', async () => {
    getIncidentsMock.mockResolvedValue([
      {
        ...sampleIncidents[0]!,
        id: 'inc-completed',
        title: 'Completed analysis incident',
        analysis: { status: 'completed', summary: 'Done' },
      },
      {
        ...sampleIncidents[0]!,
        id: 'inc-pending',
        title: 'Pending analysis incident',
        analysis: { status: 'pending' },
      },
      {
        ...sampleIncidents[0]!,
        id: 'inc-failed',
        title: 'Failed analysis incident',
        analysis: { status: 'failed' },
      },
      {
        ...sampleIncidents[0]!,
        id: 'inc-none',
        title: 'No analysis incident',
      },
    ]);

    renderPage();

    expect(
      await screen.findByRole('columnheader', { name: 'Analysis' }),
    ).toBeInTheDocument();
    expect(screen.getByText('AI Analyzed')).toBeInTheDocument();
    expect(screen.getByText('Analyzing…')).toBeInTheDocument();
    expect(screen.getByText('Analysis failed')).toBeInTheDocument();
    expect(screen.getByText('Not analyzed')).toBeInTheDocument();
  });

  it('shows Not analyzed when incidents have no analysis field', async () => {
    getIncidentsMock.mockResolvedValue(sampleIncidents);

    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Checkout timeouts' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Not analyzed')).toHaveLength(2);
  });

  it('shows an empty state when there are no incidents', async () => {
    getIncidentsMock.mockResolvedValue([]);

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'No incidents detected' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("IncidentLens hasn't received any incidents yet."),
    ).toBeInTheDocument();

    const summary = screen.getByRole('list', { name: 'Incident summary' });
    expect(within(summary).getAllByText('0')).toHaveLength(4);
  });

  it('shows an error state when the API fails', async () => {
    getIncidentsMock.mockRejectedValue(
      new ApiError(500, 'Something went wrong. Please try again.'),
    );

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Unable to load incidents' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't retrieve incidents from the IncidentLens API.",
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Incident summary' }),
    ).not.toBeInTheDocument();
  });

  it('retries GET /incidents and renders incidents after success', async () => {
    const user = userEvent.setup();
    getIncidentsMock
      .mockRejectedValueOnce(new ApiError(500, 'Something went wrong.'))
      .mockResolvedValueOnce(sampleIncidents);

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Unable to load incidents' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole('link', { name: 'Checkout timeouts' }),
    ).toBeInTheDocument();
    expect(getIncidentsMock).toHaveBeenCalledTimes(2);
  });
});
