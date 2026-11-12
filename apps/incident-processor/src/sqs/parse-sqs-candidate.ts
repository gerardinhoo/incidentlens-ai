import type { ParsedIncidentCandidate } from '../cloudwatch/types.js';

export class SqsCandidateParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqsCandidateParseError';
  }
}

/**
 * SQS message body is the JSON ParsedIncidentCandidate produced by ingest.
 */
export function parseSqsCandidateBody(body: string): ParsedIncidentCandidate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new SqsCandidateParseError('SQS message body is not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new SqsCandidateParseError('SQS candidate body must be an object');
  }

  const record = parsed as Record<string, unknown>;
  if (record['eventType'] !== 'incident_candidate') {
    throw new SqsCandidateParseError(
      'SQS candidate body must have eventType=incident_candidate',
    );
  }
  if (typeof record['sourceEventId'] !== 'string') {
    throw new SqsCandidateParseError(
      'SQS candidate body must include sourceEventId',
    );
  }

  return parsed as ParsedIncidentCandidate;
}
