import type { IncidentSeverity } from './incident-severity.js';
import type { IncidentStatus } from './incident-status.js';

/**
 * Input required to create a new incident.
 * System-owned fields (id, status, timestamps, default metadata) are assigned by the domain.
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
  createdAt: string;
  updatedAt: string;
}
