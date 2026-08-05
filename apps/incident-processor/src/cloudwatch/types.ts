/**
 * CloudWatch Logs subscription transport types and normalized parse results.
 * No Incident domain entities — transport layer only (SCRUM-33).
 */

export interface CloudWatchLogsEvent {
  awslogs: {
    data: string;
  };
}

export type CloudWatchMessageType = 'DATA_MESSAGE' | 'CONTROL_MESSAGE';

export interface CloudWatchLogEvent {
  id: string;
  timestamp: number;
  message: string;
}

export interface CloudWatchDecodedPayload {
  owner: string;
  logGroup: string;
  logStream: string;
  subscriptionFilters: string[];
  messageType: CloudWatchMessageType;
  logEvents: CloudWatchLogEvent[];
}

/**
 * Parser-level severity allowlist.
 * Includes Pino textual levels (emitted by /test-error) and domain incident
 * severities for future alignment — without importing the Fastify API or
 * creating Incident entities.
 */
export const PARSER_SEVERITIES = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'low',
  'medium',
  'high',
  'critical',
] as const;

export type ParserSeverity = (typeof PARSER_SEVERITIES)[number];

export const MAX_CANDIDATE_MSG_LENGTH = 256;

export interface ParsedIncidentCandidate {
  sourceEventId: string;
  timestamp: number;
  logGroup: string;
  logStream: string;
  eventType: 'incident_candidate';
  requestId?: string;
  service?: string;
  environment?: string;
  severity?: ParserSeverity;
  errorType?: string;
  errorName?: string;
  statusCode?: number;
  route?: string;
  url?: string;
  msg?: string;
}

export type LogRecordParseResult =
  | { outcome: 'candidate'; candidate: ParsedIncidentCandidate }
  | { outcome: 'ignored'; reason: string }
  | { outcome: 'failed'; reason: string };

export interface ParsedCloudWatchBatch {
  messageType: CloudWatchMessageType;
  logGroup: string;
  logStream: string;
  owner: string;
  receivedRecords: number;
  parsedCandidates: ParsedIncidentCandidate[];
  ignoredRecords: number;
  failedRecords: number;
}

export type CloudWatchErrorCategory =
  | 'missing_awslogs_data'
  | 'empty_data'
  | 'invalid_base64'
  | 'gzip_failed'
  | 'json_parse_failed'
  | 'invalid_payload_shape'
  | 'unsupported_message_type';

export class CloudWatchTransportError extends Error {
  readonly category: CloudWatchErrorCategory;

  constructor(category: CloudWatchErrorCategory, message: string) {
    super(message);
    this.name = 'CloudWatchTransportError';
    this.category = category;
  }
}
