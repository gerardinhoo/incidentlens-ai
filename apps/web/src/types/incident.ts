/**
 * Frontend type boundary for incidents.
 *
 * The shared `packages/domain` Incident types are browser-safe (no AWS / Node
 * runtime imports). This app intentionally does **not** import domain modules
 * into the SPA yet, to keep a clear DTO boundary and avoid bundling domain
 * lifecycle helpers.
 *
 * SCRUM-44 will map HTTP API DTOs onto these shapes (or re-export domain types
 * via type-only imports) without pulling repository or infrastructure code
 * into the browser.
 */
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentStatus = 'open' | 'investigating' | 'resolved';

export type IncidentAnalysisStatus = 'pending' | 'completed' | 'failed';

/**
 * Placeholder incident DTO aligned with the domain Incident aggregate.
 * Not fetched yet — list/details pages are placeholders until SCRUM-44/45/46.
 */
export interface IncidentDto {
  id: string;
  title: string;
  description?: string;
  source: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  errorType: string;
  requestId?: string;
  metadata: Record<string, string>;
  analysis?: {
    status: IncidentAnalysisStatus;
    summary?: string;
    possibleCause?: string;
    recommendedActions?: readonly string[];
    analyzedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}
