import type { Incident } from '../../../../packages/domain/src/index.js';
import {
  INCIDENT_ANALYSIS_BOUNDS,
  type IncidentAnalysisInput,
} from '../../../../packages/analysis/src/index.js';

import type { ParsedIncidentCandidate } from '../cloudwatch/types.js';

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return value.slice(0, max);
}

function readMetadata(incident: Incident, key: string): string | undefined {
  const value = incident.metadata[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

/**
 * Build allow-listed IncidentAnalysisInput from a persisted incident and
 * the originating candidate (for optional fields not always on Incident).
 * Never passes the full Incident / metadata bag / raw logs.
 */
export function mapIncidentToAnalysisInput(
  incident: Incident,
  candidate?: ParsedIncidentCandidate,
): IncidentAnalysisInput {
  let statusCode: number | undefined;
  const statusCodeRaw =
    readMetadata(incident, 'statusCode') ??
    (typeof candidate?.statusCode === 'number'
      ? String(candidate.statusCode)
      : undefined);
  if (statusCodeRaw !== undefined) {
    const parsed = Number(statusCodeRaw);
    if (Number.isFinite(parsed)) {
      statusCode = parsed;
    }
  }

  const route =
    readMetadata(incident, 'route') ??
    (candidate?.route?.trim() ? candidate.route.trim() : undefined);
  const environment =
    readMetadata(incident, 'environment') ??
    (candidate?.environment?.trim() ? candidate.environment.trim() : undefined);
  const safeMessageRaw =
    incident.description?.trim() ||
    (candidate?.msg?.trim() ? candidate.msg.trim() : undefined) ||
    undefined;

  return {
    service: incident.source,
    severity: incident.severity,
    errorType: incident.errorType,
    ...(statusCode !== undefined ? { statusCode } : {}),
    ...(route ? { route: truncate(route, 200) } : {}),
    ...(environment ? { environment: truncate(environment, 150) } : {}),
    ...(safeMessageRaw
      ? {
          safeMessage: truncate(
            safeMessageRaw,
            INCIDENT_ANALYSIS_BOUNDS.safeMessageMaxLength,
          ),
        }
      : {}),
  };
}
