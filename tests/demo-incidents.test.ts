import { describe, expect, it } from 'vitest';

import { INCIDENT_SEVERITIES } from '../packages/domain/src/incident-severity.js';
import { INCIDENT_STATUSES } from '../packages/domain/src/incident-status.js';
import { DEMO_INCIDENTS } from './fixtures/demo-incidents.js';

describe('DEMO_INCIDENTS', () => {
  it('covers mixed services, severities, statuses, and analysis states', () => {
    const sources = new Set(DEMO_INCIDENTS.map((incident) => incident.source));
    const severities = new Set(
      DEMO_INCIDENTS.map((incident) => incident.severity),
    );
    const statuses = new Set(DEMO_INCIDENTS.map((incident) => incident.status));
    const analysis = new Set(
      DEMO_INCIDENTS.map((incident) => incident.analysis?.status ?? 'absent'),
    );

    expect(DEMO_INCIDENTS.length).toBeGreaterThanOrEqual(5);
    expect(sources.size).toBeGreaterThanOrEqual(4);
    expect(severities.size).toBe(INCIDENT_SEVERITIES.length);
    expect(statuses.size).toBe(INCIDENT_STATUSES.length);
    expect(analysis.has('completed')).toBe(true);
    expect(analysis.has('pending')).toBe(true);
    expect(analysis.has('failed')).toBe(true);
    expect(analysis.has('absent')).toBe(true);
  });

  it('uses stable demo ids and contains no email addresses', () => {
    const ids = DEMO_INCIDENTS.map((incident) => incident.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('demo-'))).toBe(true);
    expect(JSON.stringify(DEMO_INCIDENTS)).not.toMatch(/@/);
  });
});
