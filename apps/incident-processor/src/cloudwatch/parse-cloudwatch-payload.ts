import { parseLogRecord } from './parse-log-record.js';
import type {
  CloudWatchDecodedPayload,
  ParsedCloudWatchBatch,
  ParsedIncidentCandidate,
} from './types.js';

/**
 * Process a validated CloudWatch payload into a batch summary + candidates.
 * CONTROL_MESSAGE → zero counts. DATA_MESSAGE → per-record parse with isolation.
 */
export function parseCloudWatchPayload(
  payload: CloudWatchDecodedPayload,
): ParsedCloudWatchBatch {
  if (payload.messageType === 'CONTROL_MESSAGE') {
    return {
      messageType: 'CONTROL_MESSAGE',
      logGroup: payload.logGroup,
      logStream: payload.logStream,
      owner: payload.owner,
      receivedRecords: 0,
      parsedCandidates: [],
      ignoredRecords: 0,
      failedRecords: 0,
    };
  }

  const parsedCandidates: ParsedIncidentCandidate[] = [];
  let ignoredRecords = 0;
  let failedRecords = 0;

  for (const logEvent of payload.logEvents) {
    const result = parseLogRecord(
      logEvent,
      payload.logGroup,
      payload.logStream,
    );
    if (result.outcome === 'candidate') {
      parsedCandidates.push(result.candidate);
    } else if (result.outcome === 'ignored') {
      ignoredRecords += 1;
    } else {
      failedRecords += 1;
    }
  }

  return {
    messageType: 'DATA_MESSAGE',
    logGroup: payload.logGroup,
    logStream: payload.logStream,
    owner: payload.owner,
    receivedRecords: payload.logEvents.length,
    parsedCandidates,
    ignoredRecords,
    failedRecords,
  };
}
