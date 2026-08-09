import { describe, expect, it } from 'vitest';

import { createIncident } from './create-incident.js';
import {
  completeIncidentAnalysis,
  failIncidentAnalysis,
  markIncidentAnalysisPending,
} from './incident-analysis-lifecycle.js';

const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function baseIncident() {
  return createIncident({
    title: 'Error detected in payments-api',
    source: 'payments-api',
    severity: 'high',
    errorType: 'TimeoutError',
    description: 'upstream timed out',
  });
}

describe('incident analysis lifecycle', () => {
  it('marks analysis pending without changing lifecycle status', () => {
    const incident = baseIncident();
    const pending = markIncidentAnalysisPending(incident);

    expect(pending).not.toBe(incident);
    expect(incident.analysis).toBeUndefined();
    expect(pending.status).toBe('open');
    expect(pending.analysis).toEqual({ status: 'pending' });
    expect(pending.updatedAt).toMatch(ISO_UTC_PATTERN);
    expect(pending.updatedAt >= incident.updatedAt).toBe(true);
    expect(pending.severity).toBe(incident.severity);
    expect(pending.title).toBe(incident.title);
  });

  it('completes analysis with validated fields and analyzedAt', () => {
    const pending = markIncidentAnalysisPending(baseIncident());
    const completed = completeIncidentAnalysis(pending, {
      summary: 'Payments timed out on checkout.',
      possibleCause: 'A possible cause is an upstream dependency timeout.',
      recommendedActions: [
        'Inspect recent application logs.',
        'Check dependency health.',
      ],
    });

    expect(completed.status).toBe('open');
    expect(completed.analysis?.status).toBe('completed');
    expect(completed.analysis?.summary).toBe('Payments timed out on checkout.');
    expect(completed.analysis?.possibleCause).toContain('possible cause');
    expect(completed.analysis?.recommendedActions).toEqual([
      'Inspect recent application logs.',
      'Check dependency health.',
    ]);
    expect(completed.analysis?.analyzedAt).toMatch(ISO_UTC_PATTERN);
    expect(completed.updatedAt).toMatch(ISO_UTC_PATTERN);
  });

  it('fails analysis without fabricating summary/cause/actions', () => {
    const pending = markIncidentAnalysisPending(baseIncident());
    const failed = failIncidentAnalysis(pending);

    expect(failed.status).toBe('open');
    expect(failed.analysis?.status).toBe('failed');
    expect(failed.analysis?.analyzedAt).toMatch(ISO_UTC_PATTERN);
    expect(failed.analysis?.summary).toBeUndefined();
    expect(failed.analysis?.possibleCause).toBeUndefined();
    expect(failed.analysis?.recommendedActions).toBeUndefined();
  });

  it('rejects empty completed analysis fields', () => {
    const pending = markIncidentAnalysisPending(baseIncident());
    expect(() =>
      completeIncidentAnalysis(pending, {
        summary: '   ',
        possibleCause: 'A possible cause is X.',
        recommendedActions: ['Check logs.'],
      }),
    ).toThrow(/non-empty/);
  });

  it('keeps manual incidents valid without analysis', () => {
    const manual = baseIncident();
    expect(manual.analysis).toBeUndefined();
    expect(manual.status).toBe('open');
  });
});
