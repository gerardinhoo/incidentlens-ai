import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';

import {
  CloudWatchTransportError,
  type CloudWatchDecodedPayload,
  type CloudWatchLogEvent,
  type CloudWatchLogsEvent,
  type CloudWatchMessageType,
} from './types.js';

const gunzipAsync = promisify(gunzip);

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

/**
 * Shape check: event looks like a CloudWatch Logs subscription envelope.
 * `data` may be empty — decodeCloudWatchEvent fails that case as a transport error.
 */
export function hasCloudWatchLogsEnvelope(event: unknown): boolean {
  if (event === null || typeof event !== 'object') {
    return false;
  }
  if (!('awslogs' in event)) {
    return false;
  }
  const { awslogs } = event;
  if (awslogs === null || typeof awslogs !== 'object') {
    return false;
  }
  if (!('data' in awslogs)) {
    return false;
  }
  return typeof awslogs.data === 'string';
}

/**
 * Runtime type predicate for a non-empty CloudWatch Logs envelope.
 */
export function isCloudWatchLogsEvent(
  event: unknown,
): event is CloudWatchLogsEvent {
  return (
    hasCloudWatchLogsEnvelope(event) &&
    typeof (event as CloudWatchLogsEvent).awslogs.data === 'string' &&
    (event as CloudWatchLogsEvent).awslogs.data.length > 0
  );
}

function assertStrictBase64(data: string): void {
  if (!BASE64_PATTERN.test(data) || data.length % 4 !== 0) {
    throw new CloudWatchTransportError(
      'invalid_base64',
      'awslogs.data is not valid Base64',
    );
  }
}

function parseLogEvent(value: unknown, index: number): CloudWatchLogEvent {
  if (value === null || typeof value !== 'object') {
    throw new CloudWatchTransportError(
      'invalid_payload_shape',
      `logEvents[${index}] is not an object`,
    );
  }
  const record = value as Record<string, unknown>;
  if (!isNonEmptyString(record['id'])) {
    throw new CloudWatchTransportError(
      'invalid_payload_shape',
      `logEvents[${index}].id is missing or empty`,
    );
  }
  if (!isFiniteNumber(record['timestamp'])) {
    throw new CloudWatchTransportError(
      'invalid_payload_shape',
      `logEvents[${index}].timestamp is not a finite number`,
    );
  }
  if (typeof record['message'] !== 'string') {
    throw new CloudWatchTransportError(
      'invalid_payload_shape',
      `logEvents[${index}].message is not a string`,
    );
  }
  return {
    id: record['id'],
    timestamp: record['timestamp'],
    message: record['message'],
  };
}

/**
 * Validate the decompressed CloudWatch Logs subscription payload.
 * Never returns a silently cast object.
 */
export function validateCloudWatchPayload(
  value: unknown,
): CloudWatchDecodedPayload {
  if (value === null || typeof value !== 'object') {
    throw new CloudWatchTransportError(
      'invalid_payload_shape',
      'decoded payload is not an object',
    );
  }

  const payload = value as Record<string, unknown>;
  const owner = payload['owner'];
  const logGroup = payload['logGroup'];
  const logStream = payload['logStream'];
  const subscriptionFilters = payload['subscriptionFilters'];

  if (!isNonEmptyString(owner)) {
    throw new CloudWatchTransportError(
      'invalid_payload_shape',
      'owner must be a non-empty string',
    );
  }
  if (!isNonEmptyString(logGroup)) {
    throw new CloudWatchTransportError(
      'invalid_payload_shape',
      'logGroup must be a non-empty string',
    );
  }
  if (!isNonEmptyString(logStream)) {
    throw new CloudWatchTransportError(
      'invalid_payload_shape',
      'logStream must be a non-empty string',
    );
  }
  if (!isStringArray(subscriptionFilters)) {
    throw new CloudWatchTransportError(
      'invalid_payload_shape',
      'subscriptionFilters must be a string array',
    );
  }

  const messageTypeRaw = payload['messageType'];
  if (
    messageTypeRaw !== 'DATA_MESSAGE' &&
    messageTypeRaw !== 'CONTROL_MESSAGE'
  ) {
    throw new CloudWatchTransportError(
      'unsupported_message_type',
      'messageType must be DATA_MESSAGE or CONTROL_MESSAGE',
    );
  }
  const messageType: CloudWatchMessageType = messageTypeRaw;

  let logEvents: CloudWatchLogEvent[] = [];
  if (messageType === 'DATA_MESSAGE') {
    if (!Array.isArray(payload['logEvents'])) {
      throw new CloudWatchTransportError(
        'invalid_payload_shape',
        'DATA_MESSAGE requires a logEvents array',
      );
    }
    logEvents = payload['logEvents'].map((event, index) =>
      parseLogEvent(event, index),
    );
  }

  return {
    owner,
    logGroup,
    logStream,
    subscriptionFilters,
    messageType,
    logEvents,
  };
}

/**
 * Decode pipeline: Base64 → gunzip → UTF-8 → JSON → runtime validation.
 * Never logs raw data or decompressed content.
 */
export async function decodeCloudWatchEvent(
  event: unknown,
): Promise<CloudWatchDecodedPayload> {
  if (event === null || typeof event !== 'object' || !('awslogs' in event)) {
    throw new CloudWatchTransportError(
      'missing_awslogs_data',
      'event is missing awslogs.data',
    );
  }

  const { awslogs } = event;
  if (awslogs === null || typeof awslogs !== 'object' || !('data' in awslogs)) {
    throw new CloudWatchTransportError(
      'missing_awslogs_data',
      'event is missing awslogs.data',
    );
  }

  const { data } = awslogs;
  if (typeof data !== 'string') {
    throw new CloudWatchTransportError(
      'missing_awslogs_data',
      'awslogs.data must be a string',
    );
  }
  if (data.length === 0) {
    throw new CloudWatchTransportError('empty_data', 'awslogs.data is empty');
  }

  assertStrictBase64(data);

  let compressed: Buffer;
  try {
    compressed = Buffer.from(data, 'base64');
  } catch {
    throw new CloudWatchTransportError(
      'invalid_base64',
      'failed to decode awslogs.data as Base64',
    );
  }

  if (compressed.length === 0) {
    throw new CloudWatchTransportError(
      'invalid_base64',
      'Base64 decoding produced an empty buffer',
    );
  }

  let decompressed: Buffer;
  try {
    decompressed = await gunzipAsync(compressed);
  } catch {
    throw new CloudWatchTransportError(
      'gzip_failed',
      'failed to gunzip CloudWatch Logs payload',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decompressed.toString('utf8')) as unknown;
  } catch {
    throw new CloudWatchTransportError(
      'json_parse_failed',
      'failed to parse decompressed CloudWatch Logs JSON',
    );
  }

  return validateCloudWatchPayload(parsed);
}
