/**
 * Result returned by the incident processor Lambda foundation.
 */
export interface ProcessorResult {
  accepted: boolean;
  processedRecords: number;
}

/**
 * High-level event classification only (no payload parsing).
 * - cloudwatch_logs: CloudWatch Logs subscription envelope with awslogs.data string
 * - unclassified: everything else (manual smoke, malformed, etc.)
 */
export type ProcessorEventType = 'unclassified' | 'cloudwatch_logs';
