import { describe, expect, it } from 'vitest';

import {
  completeIncidentAnalysis,
  createIncident,
  failIncidentAnalysis,
  markIncidentAnalysisPending,
} from '../../domain/src/index.js';

import { mapIncidentToNotificationInput } from './map-incident-to-notification-input.js';

describe('mapIncidentToNotificationInput', () => {
  it('maps allow-listed fields and completed analysis', () => {
    const base = createIncident({
      title: 'Timeout',
      source: 'payments-api',
      severity: 'high',
      errorType: 'TimeoutError',
      metadata: { secret: 'nope', Authorization: 'Bearer x' },
    });
    const completed = completeIncidentAnalysis(base, {
      summary: 'Summary text',
      possibleCause: 'Cause text',
      recommendedActions: ['Action one'],
    });

    const input = mapIncidentToNotificationInput(completed);
    expect(input).toEqual({
      incidentId: completed.id,
      title: 'Timeout',
      source: 'payments-api',
      severity: 'high',
      status: 'open',
      createdAt: completed.createdAt,
      analysis: {
        summary: 'Summary text',
        possibleCause: 'Cause text',
        recommendedActions: ['Action one'],
      },
    });
    expect(JSON.stringify(input)).not.toContain('secret');
    expect(JSON.stringify(input)).not.toContain('Authorization');
  });

  it('omits analysis for pending and failed states', () => {
    const base = createIncident({
      title: 'Timeout',
      source: 'payments-api',
      severity: 'critical',
      errorType: 'Error',
    });
    expect(
      mapIncidentToNotificationInput(markIncidentAnalysisPending(base))
        .analysis,
    ).toBeUndefined();
    expect(
      mapIncidentToNotificationInput(failIncidentAnalysis(base)).analysis,
    ).toBeUndefined();
  });
});
