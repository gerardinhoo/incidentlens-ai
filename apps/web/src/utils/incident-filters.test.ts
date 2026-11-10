import { describe, expect, it } from 'vitest';
import type { IncidentDto } from '../types/incident';
import {
  applyIncidentListFilters,
  incidentListFiltersAreActive,
  parseIncidentListFilters,
  uniqueIncidentServices,
} from './incident-filters';

function incident(
  partial: Pick<IncidentDto, 'id' | 'title' | 'source'> &
    Partial<Pick<IncidentDto, 'severity' | 'status' | 'analysis'>>,
): IncidentDto {
  return {
    severity: 'high',
    status: 'open',
    errorType: 'Error',
    metadata: {},
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    ...partial,
  };
}

const checkout = incident({
  id: 'inc-100',
  title: 'Checkout timeouts',
  source: 'checkout-api',
  severity: 'high',
  status: 'open',
});
const auth = incident({
  id: 'inc-99',
  title: 'Auth latency',
  source: 'auth-service',
  severity: 'critical',
  status: 'investigating',
  analysis: { status: 'completed', summary: 'Done' },
});
const worker = incident({
  id: 'inc-50',
  title: 'Worker lag',
  source: 'inventory-worker',
  severity: 'low',
  status: 'resolved',
  analysis: { status: 'failed' },
});

describe('parseIncidentListFilters', () => {
  it('reads known query keys and ignores unknown values', () => {
    const params = new URLSearchParams(
      'status=open&severity=critical&analysis=none&service=checkout-api&q=check&status=bogus',
    );
    expect(parseIncidentListFilters(params)).toEqual({
      status: 'open',
      severity: 'critical',
      analysis: 'none',
      service: 'checkout-api',
      q: 'check',
    });

    expect(
      parseIncidentListFilters(
        new URLSearchParams('status=nope&severity=&q=%20'),
      ),
    ).toEqual({});
  });
});

describe('applyIncidentListFilters', () => {
  const list = [checkout, auth, worker];

  it('returns the full list when no filters are set', () => {
    expect(applyIncidentListFilters(list, {})).toEqual(list);
  });

  it('ANDs status, severity, analysis, service, and title/id search', () => {
    expect(
      applyIncidentListFilters(list, { status: 'open' }).map((row) => row.id),
    ).toEqual(['inc-100']);
    expect(
      applyIncidentListFilters(list, { severity: 'critical' }).map(
        (row) => row.id,
      ),
    ).toEqual(['inc-99']);
    expect(
      applyIncidentListFilters(list, { analysis: 'failed' }).map(
        (row) => row.id,
      ),
    ).toEqual(['inc-50']);
    expect(
      applyIncidentListFilters(list, { service: 'auth-service' }).map(
        (row) => row.id,
      ),
    ).toEqual(['inc-99']);
    expect(
      applyIncidentListFilters(list, { q: 'CHECK' }).map((row) => row.id),
    ).toEqual(['inc-100']);
    expect(
      applyIncidentListFilters(list, { q: 'inc-99' }).map((row) => row.id),
    ).toEqual(['inc-99']);
    expect(
      applyIncidentListFilters(list, {
        status: 'open',
        severity: 'critical',
      }),
    ).toEqual([]);
  });
});

describe('incidentListFiltersAreActive', () => {
  it('is false only when every field is unset', () => {
    expect(incidentListFiltersAreActive({})).toBe(false);
    expect(incidentListFiltersAreActive({ q: 'x' })).toBe(true);
  });
});

describe('uniqueIncidentServices', () => {
  it('returns sorted unique sources', () => {
    expect(uniqueIncidentServices([checkout, auth, checkout])).toEqual([
      'auth-service',
      'checkout-api',
    ]);
  });
});
