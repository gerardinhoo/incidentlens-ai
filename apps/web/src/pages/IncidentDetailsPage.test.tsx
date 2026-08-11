import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import type { IncidentDto } from '../types/incident';
import { IncidentDetailsPage } from './IncidentDetailsPage';

const getIncidentByIdMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    getIncidentById: getIncidentByIdMock,
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
    expect(screen.getByText('Investigating')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Overview' }),
    ).toBeInTheDocument();
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
    expect(
      screen.getByText(/investigation aid and hypothesis/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Timeouts observed on checkout.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Upstream dependency latency.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Inspect dependency latency')).toBeInTheDocument();
    expect(screen.getByText('Check retries')).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
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
    expect(screen.getByText(/Analysis status: pending/i)).toBeInTheDocument();
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
    expect(screen.getByText(/Analysis status: failed/i)).toBeInTheDocument();
    expect(screen.queryByText('Possible cause')).not.toBeInTheDocument();
  });

  it('provides back-to-incidents navigation', async () => {
    getIncidentByIdMock.mockResolvedValue(baseIncident);

    renderAt('/incidents/inc-123');

    const back = await screen.findByRole('link', {
      name: 'Back to incidents',
    });
    expect(back).toHaveAttribute('href', '/incidents');
  });

  it('shows a useful 404 state with a link back', async () => {
    getIncidentByIdMock.mockRejectedValue(
      new ApiError(404, 'Incident not found', 'error'),
    );

    renderAt('/incidents/missing-id');

    expect(
      await screen.findByRole('heading', { name: 'Incident not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('missing-id');
    expect(
      screen.getByRole('link', { name: 'Return to the incidents list' }),
    ).toHaveAttribute('href', '/incidents');
  });

  it('shows a minimal error state for non-404 failures', async () => {
    getIncidentByIdMock.mockRejectedValue(
      new ApiError(500, 'Something went wrong. Please try again.'),
    );

    renderAt('/incidents/inc-123');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});
