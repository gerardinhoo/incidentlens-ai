/**
 * Result returned by the incident processor Lambda foundation.
 */
export interface ProcessorResult {
  accepted: boolean;
  processedRecords: number;
}

/**
 * High-level event classification only (no payload parsing).
 */
export type ProcessorEventType = 'unclassified' | 'awslogs';
