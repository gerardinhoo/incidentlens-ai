import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import type { IncidentDto } from '../types/incident';
import { IncidentAssigneeControls } from './IncidentAssigneeControls';

const updateIncidentAssigneeMock = vi.hoisted(() => vi.fn());

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    updateIncidentAssignee: updateIncidentAssigneeMock,
  };
});

const baseIncident: IncidentDto = {
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

describe('IncidentAssigneeControls', () => {
  afterEach(() => {
    updateIncidentAssigneeMock.mockReset();
  });

  it('assigns the incident to the current operator', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    const updated = {
      ...baseIncident,
      assigneeId: 'sub-me',
      assigneeEmail: 'ops@example.com',
    };
    updateIncidentAssigneeMock.mockResolvedValue(updated);

    render(
      <IncidentAssigneeControls
        incident={baseIncident}
        currentUserId="sub-me"
        onUpdated={onUpdated}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Assign to me' }));

    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalledWith(updated);
    });
    expect(updateIncidentAssigneeMock).toHaveBeenCalledWith('inc-123');
  });

  it('shows that the current operator already owns the incident', () => {
    render(
      <IncidentAssigneeControls
        incident={{
          ...baseIncident,
          assigneeId: 'sub-me',
          assigneeEmail: 'ops@example.com',
        }}
        currentUserId="sub-me"
        onUpdated={vi.fn()}
      />,
    );

    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('You own this incident.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Assign to me' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the previous owner when assign fails', async () => {
    const user = userEvent.setup();
    updateIncidentAssigneeMock.mockRejectedValue(
      new ApiError(500, 'Unable to assign this incident. Please try again.'),
    );

    render(
      <IncidentAssigneeControls
        incident={baseIncident}
        currentUserId="sub-me"
        onUpdated={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Assign to me' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to assign this incident. Please try again.',
    );
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });
});
