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
});
