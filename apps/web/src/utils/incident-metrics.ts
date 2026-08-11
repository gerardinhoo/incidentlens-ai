import type { IncidentDto } from '../types/incident';

export type IncidentMetrics = {
  total: number;
  critical: number;
  high: number;
  open: number;
};

/** Derive list summary metrics from already-fetched incidents. */
export function computeIncidentMetrics(
  incidents: readonly IncidentDto[],
): IncidentMetrics {
  let critical = 0;
  let high = 0;
  let open = 0;

  for (const incident of incidents) {
    if (incident.severity === 'critical') {
      critical += 1;
    }
    if (incident.severity === 'high') {
      high += 1;
    }
    if (incident.status === 'open') {
      open += 1;
    }
  }

  return {
    total: incidents.length,
    critical,
    high,
    open,
  };
}
