import { describe, expect, it } from 'vitest';
import type { IncidentDto } from '../types/incident';
import { parseIncidentListSort, sortIncidentList } from './incident-sort';

function incident(
  partial: Pick<IncidentDto, 'id' | 'severity' | 'createdAt'>,
): IncidentDto {
  return {
    title: partial.id,
    source: 'svc',
    status: 'open',
    errorType: 'Error',
    metadata: {},
    updatedAt: partial.createdAt,
    ...partial,
  };
}

const olderHigh = incident({
  id: 'inc-old-high',
  severity: 'high',
  createdAt: '2026-08-09T12:00:00.000Z',
});
const newerMedium = incident({
  id: 'inc-new-med',
  severity: 'medium',
  createdAt: '2026-08-10T15:30:00.000Z',
});
const oldestCritical = incident({
  id: 'inc-old-crit',
  severity: 'critical',
  createdAt: '2026-08-08T08:00:00.000Z',
});

describe('parseIncidentListSort', () => {
  it('defaults to created and only treats sort=severity as severity', () => {
    expect(parseIncidentListSort(new URLSearchParams())).toBe('created');
    expect(parseIncidentListSort(new URLSearchParams('sort=created'))).toBe(
      'created',
    );
    expect(parseIncidentListSort(new URLSearchParams('sort=severity'))).toBe(
      'severity',
    );
    expect(parseIncidentListSort(new URLSearchParams('sort=nope'))).toBe(
      'created',
    );
  });
});

describe('sortIncidentList', () => {
  const shuffled = [olderHigh, oldestCritical, newerMedium];

  it('sorts newest createdAt first by default', () => {
    expect(sortIncidentList(shuffled, 'created').map((row) => row.id)).toEqual([
      'inc-new-med',
      'inc-old-high',
      'inc-old-crit',
    ]);
  });

  it('sorts critical → low, then newest within a severity', () => {
    const secondHigh = incident({
      id: 'inc-newer-high',
      severity: 'high',
      createdAt: '2026-08-10T12:00:00.000Z',
    });
    expect(
      sortIncidentList([...shuffled, secondHigh], 'severity').map(
        (row) => row.id,
      ),
    ).toEqual([
      'inc-old-crit',
      'inc-newer-high',
      'inc-old-high',
      'inc-new-med',
    ]);
  });
});
