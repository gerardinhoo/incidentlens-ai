/**
 * Result returned by the incident processor Lambda.
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
  persistenceFailures: number;
}

/**
 * High-level inbound event classification (before decode).
 */
export type ProcessorEventType = 'unclassified' | 'cloudwatch_logs';
