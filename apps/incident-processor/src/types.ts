/**
 * Result returned by the incident processor Lambda.
 *
 * attemptedIncidents =
 *   persistedIncidents + duplicateIncidents + mappingFailures + persistenceFailures
 *
 * Enrichment counters (create-before-analyze):
 * - analysisAttempts: newly created incidents sent to analyzer
 * - analyzedIncidents: completed analysis successfully persisted
 * - analysisFailures: analyzer failed (incident remains; failed status attempted)
 * - analysisPersistenceFailures: could not save completed/failed analysis state
 *
 * Notification counters (after enrichment; duplicates never notify):
 * - notificationAttempts: eligible newly created incidents passed to notifier
 * - notificationsSent: publish succeeded
 * - notificationFailures: publish failed (incident/analysis remain)
 * - notificationsSkipped: newly created but not eligible (or notifier=none)
 *   Duplicates are counted only under duplicateIncidents, not here.
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
  analysisAttempts: number;
  analyzedIncidents: number;
  analysisFailures: number;
  analysisPersistenceFailures: number;
  notificationAttempts: number;
  notificationsSent: number;
  notificationFailures: number;
  notificationsSkipped: number;
}

/**
 * High-level inbound event classification (before decode).
 */
export type ProcessorEventType = 'unclassified' | 'cloudwatch_logs';
