import type { IncidentStatus } from './incident-status.js';

/** One append-only status change on an incident (US-036). */
export interface IncidentStatusHistoryEntry {
  from: IncidentStatus;
  to: IncidentStatus;
  at: string;
  actorId: string;
  actorEmail?: string;
}

export const MAX_INCIDENT_STATUS_HISTORY = 25;
