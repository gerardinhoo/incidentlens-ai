import { describe, expect, it } from 'vitest';

import type { ParsedIncidentCandidate } from '../src/cloudwatch/types.js';
import {
  MAX_INCIDENT_DESCRIPTION_LENGTH,
  MAX_INCIDENT_TITLE_LENGTH,
  mapCandidateToIncidentInput,
  mapParserSeverityToDomain,
} from '../src/incidents/map-candidate-to-incident-input.js';

function baseCandidate(
  overrides: Partial<ParsedIncidentCandidate> = {},
): ParsedIncidentCandidate {
  return {
    sourceEventId: 'evt-1',
    timestamp: 1_700_000_000_000,
    logGroup: '/aws/lambda/incidentlens-dev-api',
    logStream: '2026/08/05/[$LATEST]abcd',
    eventType: 'incident_candidate',
    requestId: 'req-1',
    service: 'incidentlens-demo-api',
    environment: 'test',
    severity: 'error',
    errorType: 'Error',
    errorName: 'Error',
    statusCode: 500,
    route: '/test-error',
    msg: 'controlled test failure',
    ...overrides,
  };
}

describe('mapParserSeverityToDomain', () => {
  it('maps domain severities as-is', () => {
    expect(mapParserSeverityToDomain('low')).toBe('low');
    expect(mapParserSeverityToDomain('medium')).toBe('medium');
    expect(mapParserSeverityToDomain('high')).toBe('high');
    expect(mapParserSeverityToDomain('critical')).toBe('critical');
  });

  it('maps known textual Pino severities', () => {
    expect(mapParserSeverityToDomain('error')).toBe('high');
    expect(mapParserSeverityToDomain('fatal')).toBe('critical');
    expect(mapParserSeverityToDomain('warn')).toBe('medium');
    expect(mapParserSeverityToDomain('info')).toBe('low');
  });

  it('rejects unsupported or missing severity', () => {
    expect(mapParserSeverityToDomain(undefined)).toBeUndefined();
    expect(mapParserSeverityToDomain('')).toBeUndefined();
    expect(mapParserSeverityToDomain('panic')).toBeUndefined();
    expect(mapParserSeverityToDomain('50')).toBeUndefined();
  });
});

describe('mapCandidateToIncidentInput', () => {
  it('maps a valid candidate to CreateIncidentInput', () => {
    const result = mapCandidateToIncidentInput(baseCandidate());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.input.source).toBe('incidentlens-demo-api');
    expect(result.input.severity).toBe('high');
    expect(result.input.errorType).toBe('Error');
    expect(result.input.title).toBe('Error detected in incidentlens-demo-api');
    expect(result.input.title.length).toBeLessThanOrEqual(
      MAX_INCIDENT_TITLE_LENGTH,
    );
    expect(result.input.requestId).toBe('req-1');
    expect(result.input.description).toBe('controlled test failure');
    expect(result.input.metadata).toEqual({
      sourceEventId: 'evt-1',
      logGroup: '/aws/lambda/incidentlens-dev-api',
      logStream: '2026/08/05/[$LATEST]abcd',
      environment: 'test',
      route: '/test-error',
      statusCode: '500',
    });
  });

  it('uses unknown-service when service is missing', () => {
    const withoutService = baseCandidate();
    delete withoutService.service;
    const result = mapCandidateToIncidentInput(withoutService);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.input.source).toBe('unknown-service');
    expect(result.input.title).toBe('Error detected in unknown-service');
  });

  it('falls back to errorName then APPLICATION_ERROR', () => {
    const withNameOnly = baseCandidate({ errorName: 'TypeError' });
    delete withNameOnly.errorType;
    const fromName = mapCandidateToIncidentInput(withNameOnly);
    expect(fromName.ok && fromName.input.errorType).toBe('TypeError');

    const neither = baseCandidate();
    delete neither.errorType;
    delete neither.errorName;
    const fallback = mapCandidateToIncidentInput(neither);
    expect(fallback.ok && fallback.input.errorType).toBe('APPLICATION_ERROR');
  });

  it('fails safely on unsupported severity', () => {
    const missingSeverity = baseCandidate();
    delete missingSeverity.severity;
    const result = mapCandidateToIncidentInput(missingSeverity);
    expect(result).toEqual({
      ok: false,
      reason: 'unsupported_or_missing_severity',
    });
  });

  it('does not include raw message beyond bounded msg / excludes sensitive fields', () => {
    const result = mapCandidateToIncidentInput(
      baseCandidate({
        msg: 'safe bounded message',
        // These are not on ParsedIncidentCandidate; ensure mapper only uses allow-list.
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const serialized = JSON.stringify(result.input);
    expect(serialized).not.toContain('authorization');
    expect(serialized).not.toContain('cookie');
    expect(serialized).not.toContain('stack');
    expect(serialized).not.toContain('headers');
    expect(result.input.description).toBe('safe bounded message');
    expect(result.input.description!.length).toBeLessThanOrEqual(
      MAX_INCIDENT_DESCRIPTION_LENGTH,
    );
  });

  it('omits description when msg is absent', () => {
    const withoutMsg = baseCandidate();
    delete withoutMsg.msg;
    const result = mapCandidateToIncidentInput(withoutMsg);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.input.description).toBeUndefined();
  });

  it('keeps titles within the domain length limit', () => {
    const longType = 'E'.repeat(250);
    const longService = 'S'.repeat(250);
    const result = mapCandidateToIncidentInput(
      baseCandidate({ errorType: longType, service: longService }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.input.title.length).toBeLessThanOrEqual(
      MAX_INCIDENT_TITLE_LENGTH,
    );
    expect(result.input.title.length).toBe(MAX_INCIDENT_TITLE_LENGTH);
    expect(result.input.errorType.length).toBeLessThanOrEqual(150);
    expect(result.input.source.length).toBeLessThanOrEqual(150);
  });

  it('preserves sourceEventId in safe metadata', () => {
    const result = mapCandidateToIncidentInput(
      baseCandidate({ sourceEventId: 'cw-event-99' }),
    );
    expect(result.ok && result.input.metadata?.['sourceEventId']).toBe(
      'cw-event-99',
    );
  });
});
