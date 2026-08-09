import { describe, expect, it } from 'vitest';

import { createIncident } from '../../domain/src/index.js';
import type { IncidentSeverity } from '../../domain/src/index.js';

import { shouldNotifyIncident } from './should-notify-incident.js';

function incidentWithSeverity(severity: IncidentSeverity) {
  return createIncident({
    title: 'Test',
    source: 'payments-api',
    severity,
    errorType: 'Error',
  });
}

describe('shouldNotifyIncident', () => {
  it('does not notify low or medium', () => {
    expect(shouldNotifyIncident(incidentWithSeverity('low'))).toBe(false);
    expect(shouldNotifyIncident(incidentWithSeverity('medium'))).toBe(false);
  });

  it('notifies high and critical', () => {
    expect(shouldNotifyIncident(incidentWithSeverity('high'))).toBe(true);
    expect(shouldNotifyIncident(incidentWithSeverity('critical'))).toBe(true);
  });
});
