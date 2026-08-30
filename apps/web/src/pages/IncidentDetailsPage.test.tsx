import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import type { IncidentDto } from '../types/incident';
import { IncidentDetailsPage } from './IncidentDetailsPage';

const getIncidentByIdMock = vi.hoisted(() => vi.fn());
const updateIncidentStatusMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    getIncidentById: getIncidentByIdMock,
    updateIncidentStatus: updateIncidentStatusMock,
  };
});

const baseIncident: IncidentDto = {
  id: 'inc-123',
  title: 'Checkout timeouts',
  source: 'checkout-api',
  severity: 'high',
  status: 'investigating',
  errorType: 'TimeoutError',
  metadata: {},
  createdAt: '2026-08-10T15:30:00.000Z',
  updatedAt: '2026-08-10T16:00:00.000Z',
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/incidents/:incidentId"
          element={<IncidentDetailsPage />}
        />
        <Route path="/incidents" element={<p>Incidents list</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('IncidentDetailsPage', () => {
  afterEach(() => {
    getIncidentByIdMock.mockReset();
    updateIncidentStatusMock.mockReset();
  });

  it('shows a loading state while the incident is pending', () => {
    getIncidentByIdMock.mockReturnValue(new Promise(() => undefined));

    renderAt('/incidents/inc-123');

    expect(
      screen.getByRole('heading', { name: 'Incident details' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading incident…');
  });

  it('uses the route ID to fetch the incident', async () => {
    getIncidentByIdMock.mockResolvedValue(baseIncident);

    renderAt('/incidents/inc-123');

    await waitFor(() => {
      expect(getIncidentByIdMock).toHaveBeenCalledWith(
        'inc-123',
        expect.any(AbortSignal),
      );
    });
  });

  it('renders essential incident fields', async () => {
    getIncidentByIdMock.mockResolvedValue(baseIncident);

    renderAt('/incidents/inc-123');

    expect(
      await screen.findByRole('heading', { name: 'Checkout timeouts' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('checkout-api').length).toBeGreaterThan(0);
    expect(screen.getByText('TimeoutError')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getAllByText('Investigating').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', { name: 'Overview' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Status' })).toBeInTheDocument();
  });

  it('renders optional description when present', async () => {
    getIncidentByIdMock.mockResolvedValue({
      ...baseIncident,
      description: 'p95 latency exceeded SLO',
    });

    renderAt('/incidents/inc-123');

    expect(
      await screen.findByRole('heading', { name: 'Description' }),
    ).toBeInTheDocument();
    expect(screen.getByText('p95 latency exceeded SLO')).toBeInTheDocument();
  });

  it('renders metadata key/value pairs', async () => {
    getIncidentByIdMock.mockResolvedValue({
      ...baseIncident,
      metadata: {
        region: 'us-east-1',
        service: 'checkout',
      },
      requestId: 'req-42',
    });

    renderAt('/incidents/inc-123');

    expect(
      await screen.findByRole('heading', { name: 'Metadata' }),
    ).toBeInTheDocument();
    expect(screen.getByText('region')).toBeInTheDocument();
    expect(screen.getByText('us-east-1')).toBeInTheDocument();
    expect(screen.getByText('service')).toBeInTheDocument();
    expect(screen.getByText('checkout')).toBeInTheDocument();
    expect(screen.getByText('req-42')).toBeInTheDocument();
  });

  it('renders completed AI analysis fields', async () => {
    getIncidentByIdMock.mockResolvedValue({
      ...baseIncident,
      analysis: {
        status: 'completed',
        summary: 'Timeouts observed on checkout.',
        possibleCause: 'Upstream dependency latency.',
        recommendedActions: ['Inspect dependency latency', 'Check retries'],
        analyzedAt: '2026-08-10T16:05:00.000Z',
      },
    });

    renderAt('/incidents/inc-123');

    expect(
      await screen.findByRole('heading', { name: 'AI Analysis' }),
    ).toBeInTheDocument();
    expect(screen.getByText('AI-generated · Completed')).toBeInTheDocument();
    expect(
      screen.getByText(
        'AI-generated hypothesis. Verify findings before taking investigation action.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Timeouts observed on checkout.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Upstream dependency latency.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Recommended Actions' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Inspect dependency latency')).toBeInTheDocument();
    expect(screen.getByText('Check retries')).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('time')
        .some(
          (el) => el.getAttribute('dateTime') === '2026-08-10T16:05:00.000Z',
        ),
    ).toBe(true);
  });

  it('works when analysis is absent', async () => {
    getIncidentByIdMock.mockResolvedValue(baseIncident);

    renderAt('/incidents/inc-123');

    expect(
      await screen.findByRole('heading', { name: 'Checkout timeouts' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'AI Analysis' }),
    ).not.toBeInTheDocument();
  });

  it('handles pending analysis safely', async () => {
    getIncidentByIdMock.mockResolvedValue({
      ...baseIncident,
      analysis: { status: 'pending' },
    });

    renderAt('/incidents/inc-123');

    expect(
      await screen.findByRole('heading', { name: 'AI Analysis' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Analyzing incident…');
    expect(
      screen.getByText(/IncidentLens is generating investigation guidance/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Summary')).not.toBeInTheDocument();
  });

  it('handles failed analysis safely', async () => {
    getIncidentByIdMock.mockResolvedValue({
      ...baseIncident,
      analysis: { status: 'failed' },
    });

    renderAt('/incidents/inc-123');

    expect(
      await screen.findByRole('heading', { name: 'AI Analysis' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Analysis unavailable')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Possible Cause' }),
    ).not.toBeInTheDocument();
  });

  it('places AI Analysis before Metadata when both are present', async () => {
    getIncidentByIdMock.mockResolvedValue({
      ...baseIncident,
      metadata: { region: 'us-east-1' },
      analysis: {
        status: 'completed',
        summary: 'Summary text',
      },
    });

    renderAt('/incidents/inc-123');

    const analysis = await screen.findByRole('heading', {
      name: 'AI Analysis',
    });
    const metadata = screen.getByRole('heading', { name: 'Metadata' });
    expect(
      analysis.compareDocumentPosition(metadata) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('provides back-to-incidents navigation on populated details', async () => {
    getIncidentByIdMock.mockResolvedValue(baseIncident);

    renderAt('/incidents/inc-123');

    const back = await screen.findByRole('link', {
      name: 'Back to incidents',
    });
    expect(back).toHaveAttribute('href', '/incidents');
  });

  it('shows a dedicated 404 not-found state with a back link', async () => {
    getIncidentByIdMock.mockRejectedValue(
      new ApiError(404, 'Incident not found', 'error'),
    );

    renderAt('/incidents/missing-id');

    expect(
      await screen.findByRole('heading', { name: 'Incident not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The incident may have been removed or the link may be invalid.',
    );
    expect(
      screen.getByRole('link', { name: 'Back to incidents' }),
    ).toHaveAttribute('href', '/incidents');
    expect(
      screen.queryByRole('button', { name: 'Retry' }),
    ).not.toBeInTheDocument();
  });

  it('shows a generic error state with Retry for non-404 failures', async () => {
    getIncidentByIdMock.mockRejectedValue(
      new ApiError(500, 'Something went wrong. Please try again.'),
    );

    renderAt('/incidents/inc-123');

    expect(
      await screen.findByRole('heading', { name: 'Unable to load incident' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't retrieve this incident from the IncidentLens API.",
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to incidents' }),
    ).toBeInTheDocument();
  });

  it('retries GET /incidents/:id and renders the incident after success', async () => {
    const user = userEvent.setup();
    getIncidentByIdMock
      .mockRejectedValueOnce(new ApiError(500, 'Something went wrong.'))
      .mockResolvedValueOnce(baseIncident);

    renderAt('/incidents/inc-123');

    expect(
      await screen.findByRole('heading', { name: 'Unable to load incident' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole('heading', { name: 'Checkout timeouts' }),
    ).toBeInTheDocument();
    expect(getIncidentByIdMock).toHaveBeenCalledTimes(2);
  });

  it('updates the displayed status and updatedAt after a successful transition', async () => {
    const user = userEvent.setup();
    getIncidentByIdMock.mockResolvedValue({
      ...baseIncident,
      status: 'open',
    });
    updateIncidentStatusMock.mockResolvedValue({
      ...baseIncident,
      status: 'investigating',
      updatedAt: '2026-08-10T17:00:00.000Z',
    });

    renderAt('/incidents/inc-123');

    expect(
      await screen.findByRole('button', { name: 'Mark Investigating' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);

    await user.click(
      screen.getByRole('button', { name: 'Mark Investigating' }),
    );

    await waitFor(() => {
      expect(screen.getAllByText('Investigating').length).toBeGreaterThan(0);
    });
    expect(
      screen
        .getAllByRole('time')
        .some(
          (el) => el.getAttribute('dateTime') === '2026-08-10T17:00:00.000Z',
        ),
    ).toBe(true);
    expect(updateIncidentStatusMock).toHaveBeenCalledWith(
      'inc-123',
      'investigating',
    );
  });

  it('keeps the previous status on the page when status update fails', async () => {
    const user = userEvent.setup();
    getIncidentByIdMock.mockResolvedValue({
      ...baseIncident,
      status: 'open',
    });
    updateIncidentStatusMock.mockRejectedValue(
      new ApiError(409, 'Invalid incident status transition', 'error'),
    );

    renderAt('/incidents/inc-123');

    expect(
      await screen.findByRole('button', { name: 'Mark Resolved' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Mark Resolved' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid incident status transition',
    );
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);
    expect(screen.queryByText('Resolved')).not.toBeInTheDocument();
  });
});
