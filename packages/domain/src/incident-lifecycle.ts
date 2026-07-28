import type { Incident } from './incident.js';
import type { IncidentStatus } from './incident-status.js';

const ALLOWED_TRANSITIONS: Readonly<
  Record<IncidentStatus, readonly IncidentStatus[]>
> = {
  open: ['investigating', 'resolved'],
  investigating: ['resolved'],
  resolved: [],
};

export function canTransition(
  from: IncidentStatus,
  to: IncidentStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertValidTransition(
  from: IncidentStatus,
  to: IncidentStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid incident status transition: ${from} -> ${to}`);
  }
}

/**
 * Returns a new incident with the target status and updated ISO 8601 timestamp.
 * Throws if the transition is not allowed.
 */
export function transitionIncident(
  incident: Incident,
  to: IncidentStatus,
): Incident {
  assertValidTransition(incident.status, to);

  return {
    ...incident,
    status: to,
    updatedAt: new Date().toISOString(),
  };
}
