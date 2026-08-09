import {
  INCIDENT_ANALYSIS_BOUNDS,
  type IncidentAnalysis,
  type IncidentAnalysisInput,
} from './incident-analysis.js';
import type { IncidentAnalyzer } from './incident-analyzer.js';
import { IncidentAnalysisError } from './incident-analysis-error.js';
import { parseIncidentAnalysis } from './parse-incident-analysis.js';

export interface FakeIncidentAnalyzerOptions {
  /** Override the deterministic default analysis. */
  result?: IncidentAnalysis;
  /** When set, analyze() rejects with this error (no network). */
  failWith?: Error;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return value.slice(0, max);
}

/**
 * Deterministic IncidentAnalyzer for tests and local composition.
 * Makes no network calls and does not perform AI reasoning.
 */
export class FakeIncidentAnalyzer implements IncidentAnalyzer {
  /** Number of analyze() invocations (test aid). */
  callCount = 0;

  constructor(private readonly options: FakeIncidentAnalyzerOptions = {}) {}

  analyze(input: IncidentAnalysisInput): Promise<IncidentAnalysis> {
    this.callCount += 1;

    if (this.options.failWith !== undefined) {
      return Promise.reject(this.options.failWith);
    }

    if (this.options.result !== undefined) {
      return Promise.resolve(parseIncidentAnalysis(this.options.result));
    }

    const service = truncate(input.service.trim() || 'unknown-service', 150);
    const errorType = truncate(
      input.errorType.trim() || 'APPLICATION_ERROR',
      150,
    );

    const summary = truncate(
      `An application error was detected in ${service}.`,
      INCIDENT_ANALYSIS_BOUNDS.summaryMaxLength,
    );
    const possibleCause = truncate(
      `A possible cause is that the service reported a ${errorType} error.`,
      INCIDENT_ANALYSIS_BOUNDS.possibleCauseMaxLength,
    );
    const recommendedActions = [
      'Review recent application logs.',
      'Check service dependencies.',
      'Review recent deployments.',
    ].map((action) =>
      truncate(action, INCIDENT_ANALYSIS_BOUNDS.actionMaxLength),
    );

    return Promise.resolve(
      parseIncidentAnalysis({
        summary,
        possibleCause,
        recommendedActions,
      }),
    );
  }
}

/** Convenience helper for tests that need a failing analyzer. */
export function createFailingFakeIncidentAnalyzer(
  category = 'provider_unavailable',
): FakeIncidentAnalyzer {
  return new FakeIncidentAnalyzer({
    failWith: new IncidentAnalysisError(category, 'Incident analysis failed'),
  });
}
