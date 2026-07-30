import { describe, expect, it } from 'vitest';

import { createIncident } from '../../domain/src/index.js';
import { sortIncidentsNewestFirst } from './sort-incidents.js';

describe('sortIncidentsNewestFirst', () => {
  it('orders by createdAt descending', () => {
    const older = {
      ...createIncident({
        title: 'Older',
        source: 'demo-api',
        severity: 'low',
        errorType: 'Error',
      }),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const newer = {
      ...createIncident({
        title: 'Newer',
        source: 'demo-api',
        severity: 'high',
        errorType: 'Error',
      }),
      createdAt: '2026-01-03T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
    };

    expect(sortIncidentsNewestFirst([older, newer])).toEqual([newer, older]);
  });

  it('uses updatedAt then id as stable tie-breakers', () => {
    const sameCreated = '2026-01-01T12:00:00.000Z';
    const olderUpdate = {
      ...createIncident({
        title: 'Older update',
        source: 'demo-api',
        severity: 'low',
        errorType: 'Error',
      }),
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: sameCreated,
      updatedAt: '2026-01-01T12:00:00.000Z',
    };
    const newerUpdate = {
      ...createIncident({
        title: 'Newer update',
        source: 'demo-api',
        severity: 'low',
        errorType: 'Error',
      }),
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      createdAt: sameCreated,
      updatedAt: '2026-01-01T13:00:00.000Z',
    };
    const sameTimestampsLowerId = {
      ...createIncident({
        title: 'Lower id',
        source: 'demo-api',
        severity: 'low',
        errorType: 'Error',
      }),
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: sameCreated,
      updatedAt: '2026-01-01T14:00:00.000Z',
    };
    const sameTimestampsHigherId = {
      ...createIncident({
        title: 'Higher id',
        source: 'demo-api',
        severity: 'low',
        errorType: 'Error',
      }),
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      createdAt: sameCreated,
      updatedAt: '2026-01-01T14:00:00.000Z',
    };

    expect(
      sortIncidentsNewestFirst([
        olderUpdate,
        sameTimestampsHigherId,
        newerUpdate,
        sameTimestampsLowerId,
      ]),
    ).toEqual([
      sameTimestampsLowerId,
      sameTimestampsHigherId,
      newerUpdate,
      olderUpdate,
    ]);
  });
});
