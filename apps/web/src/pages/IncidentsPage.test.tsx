import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import type { IncidentDto } from '../types/incident';
import { INCIDENT_POLL_INTERVAL_MS } from '../utils/incident-polling';
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

function renderPage(path = '/incidents') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <IncidentsPage />
    </MemoryRouter>,
  );
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
}

describe('IncidentsPage', () => {
  afterEach(() => {
    getIncidentsMock.mockReset();
    vi.useRealTimers();
    setDocumentHidden(false);
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

    const table = await screen.findByRole('table');
    expect(
      within(table).getByRole('link', { name: 'Checkout timeouts' }),
    ).toBeInTheDocument();
    expect(within(table).getByText('checkout-api')).toBeInTheDocument();
    expect(within(table).getAllByText('High').length).toBeGreaterThanOrEqual(1);
    expect(within(table).getAllByText('Open').length).toBeGreaterThanOrEqual(1);

    expect(
      within(table).getByRole('link', { name: 'Auth latency' }),
    ).toBeInTheDocument();
    expect(within(table).getByText('auth-service')).toBeInTheDocument();
    expect(within(table).getByText('Medium')).toBeInTheDocument();
    expect(within(table).getByText('Investigating')).toBeInTheDocument();

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

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('link')).toHaveLength(2);
    const dataRows = within(table).getAllByRole('row').slice(1);
    expect(dataRows).toHaveLength(2);
    for (const row of dataRows) {
      expect(row).toHaveAttribute('tabIndex', '0');
    }
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

    const table = await screen.findByRole('table');
    expect(
      within(table).getByRole('columnheader', { name: 'Analysis' }),
    ).toBeInTheDocument();
    expect(within(table).getByText('AI Analyzed')).toBeInTheDocument();
    expect(within(table).getByText('Analyzing…')).toBeInTheDocument();
    expect(within(table).getByText('Analysis failed')).toBeInTheDocument();
    expect(within(table).getByText('Not analyzed')).toBeInTheDocument();
  });

  it('shows Not analyzed when incidents have no analysis field', async () => {
    getIncidentsMock.mockResolvedValue(sampleIncidents);

    renderPage();

    const table = await screen.findByRole('table');
    expect(
      within(table).getByRole('link', { name: 'Checkout timeouts' }),
    ).toBeInTheDocument();
    expect(within(table).getAllByText('Not analyzed')).toHaveLength(2);
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

  it('filters the list from ?status=open and keeps summary counts on the full set', async () => {
    getIncidentsMock.mockResolvedValue(sampleIncidents);

    renderPage('/incidents?status=open');

    expect(
      await screen.findByRole('link', { name: 'Checkout timeouts' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Auth latency' }),
    ).not.toBeInTheDocument();

    const summary = screen.getByRole('list', { name: 'Incident summary' });
    expect(within(summary).getByText('2')).toBeInTheDocument();
    expect(
      within(summary).getByRole('button', { name: /Open/ }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('lets metric cards and search update the visible rows', async () => {
    const user = userEvent.setup();
    getIncidentsMock.mockResolvedValue(sampleIncidents);

    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Auth latency' }),
    ).toBeInTheDocument();

    const summary = screen.getByRole('list', { name: 'Incident summary' });
    await user.click(within(summary).getByRole('button', { name: /High/ }));

    expect(
      screen.getByRole('link', { name: 'Checkout timeouts' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Auth latency' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(
      screen.getByRole('link', { name: 'Auth latency' }),
    ).toBeInTheDocument();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search' }),
      'inc-99',
    );
    expect(
      screen.getByRole('link', { name: 'Auth latency' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Checkout timeouts' }),
    ).not.toBeInTheDocument();
  });

  it('sorts newest first even when the API returns the opposite order', async () => {
    getIncidentsMock.mockResolvedValue([
      sampleIncidents[1]!,
      sampleIncidents[0]!,
    ]);

    renderPage();

    const table = await screen.findByRole('table');
    const links = within(table).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Checkout timeouts',
      'Auth latency',
    ]);
  });

  it('sorts critical first when ?sort=severity', async () => {
    getIncidentsMock.mockResolvedValue([
      sampleIncidents[0]!,
      {
        ...sampleIncidents[1]!,
        id: 'inc-1',
        title: 'Oldest critical',
        severity: 'critical',
        createdAt: '2026-08-01T08:00:00.000Z',
      },
    ]);

    renderPage('/incidents?sort=severity');

    const table = await screen.findByRole('table');
    const links = within(table).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Oldest critical',
      'Checkout timeouts',
    ]);
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue(
      'severity',
    );
  });

  it('shows relative created time and keeps an absolute title', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-10T15:32:00.000Z'));
    getIncidentsMock.mockResolvedValue(sampleIncidents);

    renderPage();

    const newest = await screen.findByText('2m ago');
    expect(newest.tagName).toBe('TIME');
    expect(newest).toHaveAttribute('dateTime', '2026-08-10T15:30:00.000Z');
    expect(newest).toHaveAttribute('title');
  });

  it('shows a match-empty state that is distinct from no incidents', async () => {
    getIncidentsMock.mockResolvedValue(sampleIncidents);

    renderPage('/incidents?status=resolved');

    expect(
      await screen.findByRole('heading', { name: 'No incidents match' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Nothing in the queue matches these filters.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'No incidents detected' }),
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

  it('refreshes the list on an interval without showing loading again', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    getIncidentsMock
      .mockResolvedValueOnce(sampleIncidents)
      .mockResolvedValueOnce([
        {
          ...sampleIncidents[0]!,
          title: 'Checkout timeouts (updated)',
        },
      ]);

    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Checkout timeouts' }),
    ).toBeInTheDocument();
    expect(getIncidentsMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(INCIDENT_POLL_INTERVAL_MS);

    expect(
      await screen.findByRole('link', { name: 'Checkout timeouts (updated)' }),
    ).toBeInTheDocument();
    expect(getIncidentsMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Loading incidents…')).not.toBeInTheDocument();
  });

  it('pauses list refresh while the tab is hidden and resumes when visible', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    getIncidentsMock.mockResolvedValue(sampleIncidents);

    renderPage();

    await screen.findByRole('table');
    expect(getIncidentsMock).toHaveBeenCalledTimes(1);

    setDocumentHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(INCIDENT_POLL_INTERVAL_MS * 2);
    expect(getIncidentsMock).toHaveBeenCalledTimes(1);

    setDocumentHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(getIncidentsMock).toHaveBeenCalledTimes(2);
    });
  });

  it('aborts an in-flight list poll on unmount', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    getIncidentsMock
      .mockResolvedValueOnce(sampleIncidents)
      .mockReturnValueOnce(new Promise(() => undefined));

    const { unmount } = renderPage();

    await screen.findByRole('table');
    act(() => {
      vi.advanceTimersByTime(INCIDENT_POLL_INTERVAL_MS);
    });
    expect(getIncidentsMock).toHaveBeenCalledTimes(2);

    const pollSignal = getIncidentsMock.mock.calls[1]?.[0] as AbortSignal;
    unmount();
    expect(pollSignal.aborted).toBe(true);
  });
});
