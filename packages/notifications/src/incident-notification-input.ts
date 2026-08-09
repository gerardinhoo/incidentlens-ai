import type {
  IncidentSeverity,
  IncidentStatus,
} from '../../domain/src/index.js';

/**
 * Allow-listed notification payload. No raw logs, metadata, prompts, or secrets.
 */
export interface IncidentNotificationInput {
  incidentId: string;
  title: string;
  source: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdAt: string;
  /**
   * Present only when analysis completed with validated fields.
   * Absent for pending/failed analysis — message builder uses factual fallback.
   */
  analysis?: {
    summary: string;
    possibleCause: string;
    recommendedActions: string[];
  };
}
