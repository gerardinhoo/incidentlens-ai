import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import {
  authIncidentWithAnalysis,
  listIncidentsFixture,
  paymentIncident,
  pendingAnalysisIncident,
  workerIncidentNoAnalysis,
} from './test/fixtures/incidents';
import {
  installMockApiFetch,
  uninstallMockApiFetch,
} from './test/mock-api-fetch';
import { renderWithRouter } from './test/renderWithRouter';

describe('Frontend integration (Router → pages → API client → fetch)', () => {
  afterEach(() => {
    uninstallMockApiFetch();
  });

  it('renders a populated incident list from GET /api/incidents', async () => {
    const fetchMock = installMockApiFetch({
      list: () => listIncidentsFixture,
    });

    renderWithRouter(<App />, { initialEntries: ['/incidents'] });

    expect(
      await screen.findByRole('link', {
        name: 'Payment API returning 500 errors',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Authentication latency increased' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Background worker processing delayed',
      }),
    ).toBeInTheDocument();

    expect(screen.getByText('payment-api')).toBeInTheDocument();
    expect(screen.getByText('auth-service')).toBeInTheDocument();
    expect(screen.getAllByText('Critical').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('High').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getAllByText('Open').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Investigating')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Analysis' }),
    ).toBeInTheDocument();
    expect(screen.getByText('AI Analyzed')).toBeInTheDocument();
    expect(screen.getAllByText('Not analyzed').length).toBeGreaterThanOrEqual(
      2,
    );

    const summary = screen.getByRole('list', { name: 'Incident summary' });
    expect(within(summary).getByText('Total')).toBeInTheDocument();
    expect(within(summary).getByText('Critical')).toBeInTheDocument();
    expect(within(summary).getByText('3')).toBeInTheDocument();
    expect(within(summary).getAllByText('1')).toHaveLength(2);
    expect(within(summary).getByText('2')).toBeInTheDocument();

    const times = screen.getAllByRole('time');
    expect(times.length).toBeGreaterThanOrEqual(3);
    expect(
      times.some(
        (el) => el.getAttribute('dateTime') === paymentIncident.createdAt,
      ),
    ).toBe(true);

    expect(
      screen.getByRole('link', {
        name: 'Payment API returning 500 errors',
      }),
    ).toHaveAttribute('href', `/incidents/${paymentIncident.id}`);
    expect(
      screen.getByRole('link', { name: 'Authentication latency increased' }),
    ).toHaveAttribute('href', `/incidents/${authIncidentWithAnalysis.id}`);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/incidents',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('navigates from list to details via user click and loads GET /api/incidents/:id', async () => {
    const user = userEvent.setup();
    const fetchMock = installMockApiFetch({
      list: () => listIncidentsFixture,
      byId: (id) => {
        const found = listIncidentsFixture.find(
          (incident) => incident.id === id,
        );
        if (found === undefined) {
          return Response.json(
            { status: 'error', message: 'Incident not found' },
            { status: 404 },
          );
        }
        return found;
      },
    });

    renderWithRouter(<App />, { initialEntries: ['/incidents'] });

    await user.click(
      await screen.findByRole('link', {
        name: 'Payment API returning 500 errors',
      }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Payment API returning 500 errors',
      }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/incidents/${paymentIncident.id}`,
        expect.objectContaining({ method: 'GET' }),
      );
    });

    expect(screen.getAllByText('payment-api').length).toBeGreaterThan(0);
    expect(screen.getByText('InternalServerError')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Multiple requests to the payment API are returning HTTP 500 responses.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('environment')).toBeInTheDocument();
    expect(screen.getByText('production')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Mark Investigating' }),
    ).toBeInTheDocument();

    const times = screen.getAllByRole('time');
    expect(
      times.some(
        (el) => el.getAttribute('dateTime') === paymentIncident.createdAt,
      ),
    ).toBe(true);
    expect(
      times.some(
        (el) => el.getAttribute('dateTime') === paymentIncident.updatedAt,
      ),
    ).toBe(true);
  });

  it('renders completed AI analysis from a real Incident JSON fixture', async () => {
    installMockApiFetch({
      byId: () => authIncidentWithAnalysis,
    });

    renderWithRouter(<App />, {
      initialEntries: [`/incidents/${authIncidentWithAnalysis.id}`],
    });

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
      screen.getByText(
        'Elevated auth latency correlates with dependency timeouts.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Upstream identity provider latency.'),
    ).toBeInTheDocument();

    const actions = screen.getByRole('list');
    expect(
      within(actions).getByText('Inspect identity provider latency dashboards'),
    ).toBeInTheDocument();
    expect(
      within(actions).getByText('Review recent auth-service deploys'),
    ).toBeInTheDocument();

    expect(
      screen
        .getAllByRole('time')
        .some(
          (el) =>
            el.getAttribute('dateTime') ===
            authIncidentWithAnalysis.analysis?.analyzedAt,
        ),
    ).toBe(true);
  });

  it('renders a no-analysis incident without fabricating AI content', async () => {
    installMockApiFetch({
      byId: () => workerIncidentNoAnalysis,
    });

    renderWithRouter(<App />, {
      initialEntries: [`/incidents/${workerIncidentNoAnalysis.id}`],
    });

    expect(
      await screen.findByRole('heading', {
        name: 'Background worker processing delayed',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'AI Analysis' }),
    ).not.toBeInTheDocument();
  });

  it('handles pending analysis without inventing completed fields', async () => {
    installMockApiFetch({
      byId: () => pendingAnalysisIncident,
    });

    renderWithRouter(<App />, {
      initialEntries: [`/incidents/${pendingAnalysisIncident.id}`],
    });

    expect(
      await screen.findByRole('heading', { name: 'AI Analysis' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Analyzing incident…');
    expect(screen.queryByText('Summary')).not.toBeInTheDocument();
  });

  it('shows the empty list state for GET /api/incidents → []', async () => {
    installMockApiFetch({
      list: () => [],
    });

    renderWithRouter(<App />, { initialEntries: ['/incidents'] });

    expect(
      await screen.findByRole('heading', { name: 'No incidents detected' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("IncidentLens hasn't received any incidents yet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows list API failure then recovers via Retry without remounting the app', async () => {
    const user = userEvent.setup();
    let listCalls = 0;
    const fetchMock = installMockApiFetch({
      list: () => {
        listCalls += 1;
        if (listCalls === 1) {
          return Response.json(
            { message: 'Internal Server Error' },
            { status: 500 },
          );
        }
        return listIncidentsFixture;
      },
    });

    renderWithRouter(<App />, { initialEntries: ['/incidents'] });

    expect(
      await screen.findByRole('heading', { name: 'Unable to load incidents' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole('link', {
        name: 'Payment API returning 500 errors',
      }),
    ).toBeInTheDocument();

    const listCallsToApi = fetchMock.mock.calls.filter(
      (call) => call[0] === '/api/incidents',
    );
    expect(listCallsToApi).toHaveLength(2);
    expect(screen.getByText('IncidentLens AI')).toBeInTheDocument();
  });

  it('shows a dedicated 404 state for a missing incident id', async () => {
    installMockApiFetch({
      byId: () =>
        Response.json(
          { status: 'error', message: 'Incident not found' },
          { status: 404 },
        ),
    });

    renderWithRouter(<App />, {
      initialEntries: ['/incidents/nonexistent-id'],
    });

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
    expect(
      screen.queryByText('Something went wrong. Please try again.'),
    ).not.toBeInTheDocument();
  });

  it('shows generic details failure with Retry and Back to incidents', async () => {
    const user = userEvent.setup();
    let detailCalls = 0;
    installMockApiFetch({
      byId: () => {
        detailCalls += 1;
        if (detailCalls === 1) {
          return Response.json(
            { message: 'Internal Server Error' },
            { status: 500 },
          );
        }
        return paymentIncident;
      },
    });

    renderWithRouter(<App />, {
      initialEntries: [`/incidents/${paymentIncident.id}`],
    });

    expect(
      await screen.findByRole('heading', { name: 'Unable to load incident' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to incidents' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Payment API returning 500 errors',
      }),
    ).toBeInTheDocument();
  });

  it('updates incident status via PATCH /api/incidents/:id/status', async () => {
    const user = userEvent.setup();
    const updatedAt = '2026-08-10T18:00:00.000Z';
    const fetchMock = installMockApiFetch({
      byId: () => paymentIncident,
      updateStatus: (id, status) => {
        expect(id).toBe(paymentIncident.id);
        expect(status).toBe('investigating');
        return {
          ...paymentIncident,
          status: 'investigating',
          updatedAt,
        };
      },
    });

    renderWithRouter(<App />, {
      initialEntries: [`/incidents/${paymentIncident.id}`],
    });

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
        .some((el) => el.getAttribute('dateTime') === updatedAt),
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/incidents/${paymentIncident.id}/status`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'investigating' }),
      }),
    );
  });

  it('keeps the prior status when PATCH status returns 409', async () => {
    const user = userEvent.setup();
    installMockApiFetch({
      byId: () => paymentIncident,
      updateStatus: () =>
        Response.json(
          {
            status: 'error',
            message: 'Invalid incident status transition',
          },
          { status: 409 },
        ),
    });

    renderWithRouter(<App />, {
      initialEntries: [`/incidents/${paymentIncident.id}`],
    });

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
