/**
 * Browser-safe frontend DTOs for the IncidentLens HTTP API.
 *
 * Aligned with the backend Incident JSON contract. Do not import AWS SDK,
 * Terraform, Lambda handlers, or repository modules into the SPA.
 */

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentStatus = 'open' | 'investigating' | 'resolved';

export type IncidentAnalysisStatus = 'pending' | 'completed' | 'failed';

export interface IncidentAnalysisDto {
  status: IncidentAnalysisStatus;
  summary?: string;
  possibleCause?: string;
  recommendedActions?: string[];
  analyzedAt?: string;
}

/**
 * Incident as returned by GET/POST/PATCH incident endpoints.
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
  analysis?: IncidentAnalysisDto;
  createdAt: string;
  updatedAt: string;
}

/**
 * Body for POST /incidents (client-supplied fields only).
 */
export interface CreateIncidentInput {
  title: string;
  source: string;
  severity: IncidentSeverity;
  errorType: string;
  description?: string;
  requestId?: string;
  metadata?: Record<string, string>;
}

/**
 * Body for PATCH /incidents/:id/status.
 */
export interface UpdateIncidentStatusInput {
  status: IncidentStatus;
}
