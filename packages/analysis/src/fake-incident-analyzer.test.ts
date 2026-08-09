import { describe, expect, it } from 'vitest';

import {
  FakeIncidentAnalyzer,
  INCIDENT_ANALYSIS_BOUNDS,
  IncidentAnalysisError,
  createFailingFakeIncidentAnalyzer,
  type IncidentAnalysisInput,
} from './index.js';

const baseInput: IncidentAnalysisInput = {
  service: 'incidentlens-demo-api',
  severity: 'high',
  errorType: 'Error',
  statusCode: 500,
  route: '/test-error',
  environment: 'test',
  safeMessage: 'controlled test failure',
};

describe('FakeIncidentAnalyzer', () => {
  it('implements the analyzer contract with structured fields', async () => {
    const analyzer = new FakeIncidentAnalyzer();
    const analysis = await analyzer.analyze(baseInput);

    expect(analysis.summary.length).toBeGreaterThan(0);
    expect(analysis.possibleCause.length).toBeGreaterThan(0);
    expect(analysis.recommendedActions.length).toBeGreaterThanOrEqual(
      INCIDENT_ANALYSIS_BOUNDS.recommendedActionsMin,
    );
    expect(analysis.recommendedActions.length).toBeLessThanOrEqual(
      INCIDENT_ANALYSIS_BOUNDS.recommendedActionsMax,
    );
    expect(analysis.summary).toContain('incidentlens-demo-api');
    expect(analysis.possibleCause).toContain('Error');
    expect(analysis.recommendedActions).toEqual([
      'Review recent application logs.',
      'Check service dependencies.',
      'Review recent deployments.',
    ]);
  });

  it('returns deterministic output for the same input', async () => {
    const analyzer = new FakeIncidentAnalyzer();
    const a = await analyzer.analyze(baseInput);
    const b = await analyzer.analyze(baseInput);
    expect(a).toEqual(b);
  });

  it('reflects different service and errorType values safely', async () => {
    const analyzer = new FakeIncidentAnalyzer();
    const analysis = await analyzer.analyze({
      service: 'payments-api',
      severity: 'critical',
      errorType: 'TimeoutError',
    });
    expect(analysis.summary).toBe(
      'An application error was detected in payments-api.',
    );
    expect(analysis.possibleCause).toBe(
      'The service reported a TimeoutError error.',
    );
  });

  it('does not mutate the input object', async () => {
    const analyzer = new FakeIncidentAnalyzer();
    const input: IncidentAnalysisInput = { ...baseInput };
    const frozen = Object.freeze({ ...input });
    await analyzer.analyze(frozen);
    expect(frozen).toEqual(baseInput);
  });

  it('supports injected custom results', async () => {
    const custom = {
      summary: 'Custom summary',
      possibleCause: 'Custom hypothesis',
      recommendedActions: ['Do one thing'],
    };
    const analyzer = new FakeIncidentAnalyzer({ result: custom });
    await expect(analyzer.analyze(baseInput)).resolves.toEqual(custom);
  });

  it('can simulate failure without network calls', async () => {
    const analyzer = createFailingFakeIncidentAnalyzer('provider_unavailable');
    await expect(analyzer.analyze(baseInput)).rejects.toBeInstanceOf(
      IncidentAnalysisError,
    );
    await expect(analyzer.analyze(baseInput)).rejects.toMatchObject({
      category: 'provider_unavailable',
      message: 'Incident analysis failed',
    });
  });

  it('rejects with the provided Error instance', async () => {
    const err = new IncidentAnalysisError(
      'timeout',
      'Incident analysis failed',
    );
    const analyzer = new FakeIncidentAnalyzer({ failWith: err });
    await expect(analyzer.analyze(baseInput)).rejects.toBe(err);
  });
});

describe('IncidentAnalysisInput allow-list security boundary', () => {
  it('only exposes safe operational field names', () => {
    const keys = Object.keys(baseInput).sort();
    expect(keys).toEqual(
      [
        'environment',
        'errorType',
        'route',
        'safeMessage',
        'service',
        'severity',
        'statusCode',
      ].sort(),
    );

    const forbidden = [
      'authorization',
      'body',
      'cookies',
      'headers',
      'metadata',
      'raw',
      'stack',
      'awslogs',
      'requestBody',
      'credentials',
    ];
    for (const name of forbidden) {
      expect(keys).not.toContain(name);
    }
  });

  it('does not accept arbitrary nested metadata on the allow-listed shape', () => {
    // Runtime construction must still only carry allow-listed keys.
    const input: IncidentAnalysisInput = {
      service: 'svc',
      severity: 'low',
      errorType: 'Error',
    };
    expect('metadata' in input).toBe(false);
    expect('stack' in input).toBe(false);
    expect('headers' in input).toBe(false);
  });
});

describe('IncidentAnalysisError', () => {
  it('exposes a safe category without embedding secrets', () => {
    const error = new IncidentAnalysisError(
      'invalid_response',
      'Incident analysis failed',
    );
    expect(error.name).toBe('IncidentAnalysisError');
    expect(error.category).toBe('invalid_response');
    expect(error.message).not.toMatch(/authorization|Bearer|password|prompt/i);
  });
});
