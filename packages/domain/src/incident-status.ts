export const INCIDENT_STATUSES = ['open', 'investigating', 'resolved'] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
