export const INCIDENT_ANALYSIS_STATUSES = [
  'pending',
  'completed',
  'failed',
] as const;

export type IncidentAnalysisStatus =
  (typeof INCIDENT_ANALYSIS_STATUSES)[number];
