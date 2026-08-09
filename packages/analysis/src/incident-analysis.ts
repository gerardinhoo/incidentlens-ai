import type { IncidentSeverity } from '../../domain/src/incident-severity.js';

/**
 * Application-level bounds for structured analysis text.
 * Runtime enforcement of external model responses is deferred to the Bedrock
 * response-validation story; FakeIncidentAnalyzer respects these bounds.
 */
export const INCIDENT_ANALYSIS_BOUNDS = {
  summaryMaxLength: 500,
  possibleCauseMaxLength: 500,
  recommendedActionsMin: 1,
  recommendedActionsMax: 5,
  actionMaxLength: 200,
  safeMessageMaxLength: 256,
} as const;

/**
 * Deliberately narrow AI input — allow-listed operational fields only.
 *
 * Must never include: raw CloudWatch events, raw log payloads, request bodies,
 * headers, authorization, cookies, credentials, stack traces, arbitrary
 * metadata, DynamoDB items, or the entire Incident aggregate.
 */
export interface IncidentAnalysisInput {
  readonly service: string;
  readonly severity: IncidentSeverity;
  readonly errorType: string;
  readonly statusCode?: number;
  readonly route?: string;
  readonly environment?: string;
  /**
   * Optional bounded safe message already retained by the pipeline
   * (e.g. truncated parser msg / description). Never a stack or raw log.
   */
  readonly safeMessage?: string;
}

/**
 * Structured incident analysis for engineers.
 * possibleCause is a hypothesis, not a proven root cause.
 */
export interface IncidentAnalysis {
  readonly summary: string;
  readonly possibleCause: string;
  readonly recommendedActions: readonly string[];
}
