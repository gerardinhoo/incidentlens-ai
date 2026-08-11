import { describe, expect, it } from 'vitest';
import type { IncidentDto } from '../types/incident';
import { computeIncidentMetrics } from './incident-metrics';

function incident(
  partial: Pick<IncidentDto, 'id' | 'severity' | 'status'>,
): IncidentDto {
  return {
    title: partial.id,
    source: 'svc',
    errorType: 'Error',
    metadata: {},
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    ...partial,
  };
}

describe('computeIncidentMetrics', () => {
  it('returns zeros for an empty list', () => {
    expect(computeIncidentMetrics([])).toEqual({
      total: 0,
      critical: 0,
      high: 0,
      open: 0,
    });
  });

  it('counts total, critical, high, and open', () => {
    const incidents = [
      incident({ id: '1', severity: 'critical', status: 'open' }),
      incident({ id: '2', severity: 'high', status: 'investigating' }),
      incident({ id: '3', severity: 'high', status: 'open' }),
      incident({ id: '4', severity: 'low', status: 'resolved' }),
    ];

    expect(computeIncidentMetrics(incidents)).toEqual({
      total: 4,
      critical: 1,
      high: 2,
      open: 2,
    });
  });
});
