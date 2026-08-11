import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import type { IncidentDto } from '../types/incident';
import { IncidentStatusControls } from './IncidentStatusControls';

const updateIncidentStatusMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    updateIncidentStatus: updateIncidentStatusMock,
  };
});

const openIncident: IncidentDto = {
  id: 'inc-123',
  title: 'Checkout timeouts',
  source: 'checkout-api',
  severity: 'high',
  status: 'open',
  errorType: 'TimeoutError',
  metadata: {},
  createdAt: '2026-08-10T15:30:00.000Z',
  updatedAt: '2026-08-10T15:30:00.000Z',
};

describe('IncidentStatusControls', () => {
  afterEach(() => {
    updateIncidentStatusMock.mockReset();
  });

  it('offers investigating and resolved transitions from open', () => {
    render(
      <IncidentStatusControls incident={openIncident} onUpdated={vi.fn()} />,
    );

    expect(
      screen.getByRole('button', { name: 'Mark Investigating' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mark Resolved' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('offers only resolved from investigating', () => {
    render(
      <IncidentStatusControls
        incident={{ ...openIncident, status: 'investigating' }}
        onUpdated={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Mark Resolved' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mark Investigating' }),
    ).not.toBeInTheDocument();
  });

  it('shows resolved note and no transition buttons when resolved', () => {
    render(
      <IncidentStatusControls
        incident={{ ...openIncident, status: 'resolved' }}
        onUpdated={vi.fn()}
      />,
    );

    expect(screen.getByText('This incident is resolved.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mark Investigating' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mark Resolved' }),
    ).not.toBeInTheDocument();
  });

  it('calls updateIncidentStatus and onUpdated for open → investigating', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    const updated: IncidentDto = {
      ...openIncident,
      status: 'investigating',
      updatedAt: '2026-08-10T16:00:00.000Z',
    };
    updateIncidentStatusMock.mockResolvedValue(updated);

    render(
      <IncidentStatusControls incident={openIncident} onUpdated={onUpdated} />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Mark Investigating' }),
    );

    await waitFor(() => {
      expect(updateIncidentStatusMock).toHaveBeenCalledWith(
        'inc-123',
        'investigating',
      );
    });
    expect(onUpdated).toHaveBeenCalledWith(updated);
  });

  it('calls updateIncidentStatus for open → resolved', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    updateIncidentStatusMock.mockResolvedValue({
      ...openIncident,
      status: 'resolved',
      updatedAt: '2026-08-10T16:05:00.000Z',
    });

    render(
      <IncidentStatusControls incident={openIncident} onUpdated={onUpdated} />,
    );

    await user.click(screen.getByRole('button', { name: 'Mark Resolved' }));

    await waitFor(() => {
      expect(updateIncidentStatusMock).toHaveBeenCalledWith(
        'inc-123',
        'resolved',
      );
    });
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });

  it('calls updateIncidentStatus for investigating → resolved', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    updateIncidentStatusMock.mockResolvedValue({
      ...openIncident,
      status: 'resolved',
      updatedAt: '2026-08-10T16:10:00.000Z',
    });

    render(
      <IncidentStatusControls
        incident={{ ...openIncident, status: 'investigating' }}
        onUpdated={onUpdated}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Mark Resolved' }));

    await waitFor(() => {
      expect(updateIncidentStatusMock).toHaveBeenCalledWith(
        'inc-123',
        'resolved',
      );
    });
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });

  it('disables controls while the request is pending', async () => {
    const user = userEvent.setup();
    let resolveUpdate: (value: IncidentDto) => void = () => undefined;
    updateIncidentStatusMock.mockReturnValue(
      new Promise<IncidentDto>((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    render(
      <IncidentStatusControls incident={openIncident} onUpdated={vi.fn()} />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Mark Investigating' }),
    );

    expect(screen.getByRole('status')).toHaveTextContent('Updating status…');
    expect(screen.getByRole('button', { name: 'Updating…' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Mark Resolved' }),
    ).toBeDisabled();

    resolveUpdate({
      ...openIncident,
      status: 'investigating',
      updatedAt: '2026-08-10T16:00:00.000Z',
    });

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('keeps previous status and shows an error when the update fails', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    updateIncidentStatusMock.mockRejectedValue(
      new ApiError(500, 'Something went wrong. Please try again.'),
    );

    render(
      <IncidentStatusControls incident={openIncident} onUpdated={onUpdated} />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Mark Investigating' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Mark Investigating' }),
    ).not.toBeDisabled();
  });

  it('handles 409 conflicts with the API error message', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    updateIncidentStatusMock.mockRejectedValue(
      new ApiError(409, 'Invalid incident status transition', 'error'),
    );

    render(
      <IncidentStatusControls incident={openIncident} onUpdated={onUpdated} />,
    );

    await user.click(screen.getByRole('button', { name: 'Mark Resolved' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid incident status transition',
    );
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
