import {
  MAX_CANDIDATE_MSG_LENGTH,
  PARSER_SEVERITIES,
  type CloudWatchLogEvent,
  type LogRecordParseResult,
  type ParsedIncidentCandidate,
  type ParserSeverity,
} from './types.js';

const SEVERITY_SET = new Set<string>(PARSER_SEVERITIES);

function asOptionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asOptionalStatusCode(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 100 || value > 599) {
    return undefined;
  }
  return value;
}

function asOptionalSeverity(value: unknown): ParserSeverity | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (!SEVERITY_SET.has(normalized)) {
    return undefined;
  }
  return normalized as ParserSeverity;
}

function asOptionalMsg(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  if (value.length === 0) {
    return undefined;
  }
  if (value.length > MAX_CANDIDATE_MSG_LENGTH) {
    return value.slice(0, MAX_CANDIDATE_MSG_LENGTH);
  }
  return value;
}

/**
 * Parse one CloudWatch logEvents[].message into a candidate / ignored / failed result.
 * Only eventType === "incident_candidate" becomes a candidate.
 * Arbitrary nested properties are never copied.
 */
export function parseLogRecord(
  logEvent: CloudWatchLogEvent,
  logGroup: string,
  logStream: string,
): LogRecordParseResult {
  const raw = logEvent.message.trim();
  if (raw.length === 0) {
    return { outcome: 'ignored', reason: 'empty_message' };
  }

  // Plain text / non-JSON → ignore (not a structured Pino candidate).
  if (raw[0] !== '{' && raw[0] !== '[') {
    return { outcome: 'ignored', reason: 'non_json_message' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { outcome: 'failed', reason: 'malformed_json' };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { outcome: 'ignored', reason: 'non_object_json' };
  }

  const record = parsed as Record<string, unknown>;
  if (record['eventType'] !== 'incident_candidate') {
    return { outcome: 'ignored', reason: 'non_candidate_event_type' };
  }

  const candidate: ParsedIncidentCandidate = {
    sourceEventId: logEvent.id,
    timestamp: logEvent.timestamp,
    logGroup,
    logStream,
    eventType: 'incident_candidate',
  };

  const requestId = asOptionalNonEmptyString(record['requestId']);
  if (requestId !== undefined) {
    candidate.requestId = requestId;
  }

  const service = asOptionalNonEmptyString(record['service']);
  if (service !== undefined) {
    candidate.service = service;
  }

  const environment = asOptionalNonEmptyString(record['environment']);
  if (environment !== undefined) {
    candidate.environment = environment;
  }

  const severity = asOptionalSeverity(record['severity']);
  if (severity !== undefined) {
    candidate.severity = severity;
  }

  const errorType = asOptionalNonEmptyString(record['errorType']);
  if (errorType !== undefined) {
    candidate.errorType = errorType;
  }

  const errorName = asOptionalNonEmptyString(record['errorName']);
  if (errorName !== undefined) {
    candidate.errorName = errorName;
  }

  const statusCode = asOptionalStatusCode(record['statusCode']);
  if (statusCode !== undefined) {
    candidate.statusCode = statusCode;
  }

  const route = asOptionalNonEmptyString(record['route']);
  if (route !== undefined) {
    candidate.route = route;
  }

  const url = asOptionalNonEmptyString(record['url']);
  if (url !== undefined) {
    candidate.url = url;
  }

  const msg = asOptionalMsg(record['msg']);
  if (msg !== undefined) {
    candidate.msg = msg;
  }

  return { outcome: 'candidate', candidate };
}
