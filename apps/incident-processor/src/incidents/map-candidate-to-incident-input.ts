import {
  INCIDENT_SEVERITIES,
  type CreateIncidentInput,
  type IncidentSeverity,
} from '../../../../packages/domain/src/index.js';

import type { ParsedIncidentCandidate } from '../cloudwatch/types.js';

/** Align with API create-incident schema title maxLength. */
export const MAX_INCIDENT_TITLE_LENGTH = 200;

/** Bounded safe description from parser msg only. */
export const MAX_INCIDENT_DESCRIPTION_LENGTH = 256;

export type CandidateMappingResult =
  { ok: true; input: CreateIncidentInput } | { ok: false; reason: string };

const DOMAIN_SEVERITY_SET = new Set<string>(INCIDENT_SEVERITIES);

/**
 * Map parser-level severity to domain IncidentSeverity.
 * /test-error emits textual "error" → high.
 */
export function mapParserSeverityToDomain(
  severity: string | undefined,
): IncidentSeverity | undefined {
  if (severity === undefined) {
    return undefined;
  }
  const normalized = severity.trim().toLowerCase();
  if (DOMAIN_SEVERITY_SET.has(normalized)) {
    return normalized as IncidentSeverity;
  }
  switch (normalized) {
    case 'fatal':
      return 'critical';
    case 'error':
      return 'high';
    case 'warn':
      return 'medium';
    case 'info':
    case 'debug':
    case 'trace':
      return 'low';
    default:
      return undefined;
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return value.slice(0, max);
}

function buildTitle(errorType: string, source: string): string {
  return truncate(
    `${errorType} detected in ${source}`,
    MAX_INCIDENT_TITLE_LENGTH,
  );
}

/**
 * Convert a ParsedIncidentCandidate into CreateIncidentInput.
 * Does not create IDs/timestamps — that remains createIncident()'s job.
 */
export function mapCandidateToIncidentInput(
  candidate: ParsedIncidentCandidate,
): CandidateMappingResult {
  const severity = mapParserSeverityToDomain(candidate.severity);
  if (severity === undefined) {
    return { ok: false, reason: 'unsupported_or_missing_severity' };
  }

  const source =
    candidate.service?.trim() && candidate.service.trim().length > 0
      ? truncate(candidate.service.trim(), 150)
      : 'unknown-service';

  const errorTypeRaw =
    candidate.errorType?.trim() ||
    candidate.errorName?.trim() ||
    'APPLICATION_ERROR';
  const errorType = truncate(errorTypeRaw, 150);

  const metadata: Record<string, string> = {
    sourceEventId: candidate.sourceEventId,
    logGroup: candidate.logGroup,
    logStream: candidate.logStream,
  };

  if (candidate.environment?.trim()) {
    metadata['environment'] = truncate(candidate.environment.trim(), 150);
  }
  if (candidate.route?.trim()) {
    metadata['route'] = truncate(candidate.route.trim(), 200);
  }
  if (
    typeof candidate.statusCode === 'number' &&
    Number.isFinite(candidate.statusCode)
  ) {
    metadata['statusCode'] = String(candidate.statusCode);
  }

  const input: CreateIncidentInput = {
    title: buildTitle(errorType, source),
    source,
    severity,
    errorType,
    metadata,
  };

  if (candidate.requestId !== undefined && candidate.requestId.trim()) {
    input.requestId = truncate(candidate.requestId.trim(), 200);
  }

  // Only a deliberately bounded parser msg — never stack/body/headers.
  if (candidate.msg !== undefined && candidate.msg.trim().length > 0) {
    input.description = truncate(
      candidate.msg.trim(),
      MAX_INCIDENT_DESCRIPTION_LENGTH,
    );
  }

  return { ok: true, input };
}
