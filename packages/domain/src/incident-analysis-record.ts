import type { IncidentAnalysisStatus } from './incident-analysis-status.js';

/**
 * Optional AI enrichment attached to an Incident.
 * Separate from incident lifecycle status (open/investigating/resolved).
 *
 * - pending: enrichment requested / in progress
 * - completed: validated summary/possibleCause/recommendedActions present
 * - failed: analyzer failed; no fabricated analysis fields
 */
export interface IncidentAnalysisRecord {
  status: IncidentAnalysisStatus;
  summary?: string;
  possibleCause?: string;
  recommendedActions?: readonly string[];
  analyzedAt?: string;
}

/** Validated analysis payload for completeIncidentAnalysis (provider-agnostic). */
export interface CompletedIncidentAnalysisFields {
  summary: string;
  possibleCause: string;
  recommendedActions: readonly string[];
}
