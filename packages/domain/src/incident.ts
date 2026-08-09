import type { IncidentAnalysisRecord } from './incident-analysis-record.js';
import type { IncidentSeverity } from './incident-severity.js';
import type { IncidentStatus } from './incident-status.js';

/**
 * Input required to create a new incident.
 * System-owned fields (id, status, timestamps, default metadata, analysis)
 * are assigned by the domain / trusted processors — not by public API clients.
 */
export interface CreateIncidentInput {
  title: string;
  description?: string;
  source: string;
  severity: IncidentSeverity;
  errorType: string;
  requestId?: string;
  metadata?: Record<string, string>;
}

/**
 * Incident aggregate as known to the domain.
 */
export interface Incident {
  id: string;
  title: string;
  description?: string;
  source: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  errorType: string;
  requestId?: string;
  metadata: Record<string, string>;
  /**
   * Optional AI enrichment. Absent on manual creates until enrichment runs.
   * Automatic processor creates typically start as pending.
   */
  analysis?: IncidentAnalysisRecord;
  createdAt: string;
  updatedAt: string;
}
