export const INCIDENT_SEVERITIES = [
  'low',
  'medium',
  'high',
  'critical',
] as const;

export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];
