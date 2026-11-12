import type { IncidentOperator } from './incident-assignment.js';
import type { Incident } from './incident.js';
import type { IncidentStatus } from './incident-status.js';
import {
  MAX_INCIDENT_STATUS_HISTORY,
  type IncidentStatusHistoryEntry,
} from './incident-status-history.js';

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

function cloneStatusHistory(
  entries: readonly IncidentStatusHistoryEntry[] | undefined,
): IncidentStatusHistoryEntry[] {
  if (entries === undefined) {
    return [];
  }
  return entries.map((entry) => {
    const copy: IncidentStatusHistoryEntry = {
      from: entry.from,
      to: entry.to,
      at: entry.at,
      actorId: entry.actorId,
    };
    if (entry.actorEmail !== undefined) {
      copy.actorEmail = entry.actorEmail;
    }
    return copy;
  });
}

/**
 * Returns a new incident with the target status, an append-only history
 * entry, and an updated ISO 8601 timestamp. Throws if the transition is
 * not allowed.
 */
export function transitionIncident(
  incident: Incident,
  to: IncidentStatus,
  actor?: IncidentOperator,
): Incident {
  assertValidTransition(incident.status, to);

  const at = new Date().toISOString();
  const actorId =
    actor !== undefined && actor.id.trim().length > 0
      ? actor.id.trim()
      : 'anonymous';
  const entry: IncidentStatusHistoryEntry = {
    from: incident.status,
    to,
    at,
    actorId,
  };
  const email = actor?.email?.trim();
  if (email !== undefined && email.length > 0) {
    entry.actorEmail = email;
  }

  const statusHistory = [...cloneStatusHistory(incident.statusHistory), entry];
  if (statusHistory.length > MAX_INCIDENT_STATUS_HISTORY) {
    statusHistory.splice(0, statusHistory.length - MAX_INCIDENT_STATUS_HISTORY);
  }

  return {
    ...incident,
    status: to,
    statusHistory,
    updatedAt: at,
  };
}
