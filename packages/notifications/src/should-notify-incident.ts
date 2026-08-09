import type { Incident, IncidentSeverity } from '../../domain/src/index.js';

/**
 * Default eligibility: high and critical only.
 * Threshold can become configurable later without changing SNS wiring.
 */
const DEFAULT_NOTIFY_SEVERITIES: ReadonlySet<IncidentSeverity> = new Set([
  'high',
  'critical',
]);

/**
 * Policy-only check — independent of SNS / notifier implementation.
 */
export function shouldNotifyIncident(incident: Incident): boolean {
  return DEFAULT_NOTIFY_SEVERITIES.has(incident.severity);
}
