/**
 * Result returned by the incident processor Lambda.
 *
 * attemptedIncidents =
 *   persistedIncidents + duplicateIncidents + mappingFailures + persistenceFailures
 * (mappingFailures are reported via the persistence summary / batch logs;
 * the Lambda result exposes duplicate + create/failure counts for operators.)
 */
export interface ProcessorResult {
  accepted: boolean;
  messageType: 'DATA_MESSAGE' | 'CONTROL_MESSAGE' | 'unclassified';
  receivedRecords: number;
  processedRecords: number;
  ignoredRecords: number;
  failedRecords: number;
  attemptedIncidents: number;
  persistedIncidents: number;
  duplicateIncidents: number;
  persistenceFailures: number;
}

/**
 * High-level inbound event classification (before decode).
 */
export type ProcessorEventType = 'unclassified' | 'cloudwatch_logs';
