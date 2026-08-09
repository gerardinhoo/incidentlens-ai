import { describe, expect, it } from 'vitest';

import { createIncident } from '../../../../packages/domain/src/index.js';

import type { ParsedIncidentCandidate } from '../cloudwatch/types.js';
import { mapIncidentToAnalysisInput } from './map-incident-to-analysis-input.js';

describe('mapIncidentToAnalysisInput', () => {
  it('maps allow-listed fields from incident and candidate', () => {
    const incident = createIncident({
      title: 'Error detected in payments-api',
      source: 'payments-api',
      severity: 'high',
      errorType: 'TimeoutError',
      description: 'upstream timed out',
      metadata: {
        sourceEventId: 'evt-1',
        statusCode: '504',
        route: '/checkout',
        environment: 'dev',
      },
    });
    const candidate: ParsedIncidentCandidate = {
      sourceEventId: 'evt-1',
      timestamp: 1,
      logGroup: '/aws/lambda/api',
      logStream: 'stream',
      eventType: 'incident_candidate',
      statusCode: 504,
      route: '/checkout',
      environment: 'dev',
      msg: 'upstream timed out',
    };

    const input = mapIncidentToAnalysisInput(incident, candidate);
    expect(input).toEqual({
      service: 'payments-api',
      severity: 'high',
      errorType: 'TimeoutError',
      statusCode: 504,
      route: '/checkout',
      environment: 'dev',
      safeMessage: 'upstream timed out',
    });
    expect(JSON.stringify(input)).not.toContain('sourceEventId');
    expect(JSON.stringify(input)).not.toContain('logGroup');
  });

  it('omits optional fields cleanly when absent', () => {
    const incident = createIncident({
      title: 'Error detected in api',
      source: 'api',
      severity: 'medium',
      errorType: 'Error',
    });
    const input = mapIncidentToAnalysisInput(incident);
    expect(input).toEqual({
      service: 'api',
      severity: 'medium',
      errorType: 'Error',
    });
    expect(input).not.toHaveProperty('statusCode');
    expect(input).not.toHaveProperty('route');
  });
});
