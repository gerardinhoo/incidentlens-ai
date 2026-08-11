import type { IncidentStatus } from '../types/incident';

/** Allowed next statuses for the incident lifecycle (matches backend rules). */
const ALLOWED_TRANSITIONS: Readonly<
  Record<IncidentStatus, readonly IncidentStatus[]>
> = {
  open: ['investigating', 'resolved'],
  investigating: ['resolved'],
  resolved: [],
};

export function getAllowedStatusTransitions(
  status: IncidentStatus,
): readonly IncidentStatus[] {
  return ALLOWED_TRANSITIONS[status];
}

export function canTransitionStatus(
  from: IncidentStatus,
  to: IncidentStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Action labels for transition buttons (not badge labels). */
export const STATUS_TRANSITION_LABELS = {
  investigating: 'Mark Investigating',
  resolved: 'Mark Resolved',
} as const satisfies Record<Exclude<IncidentStatus, 'open'>, string>;
