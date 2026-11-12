import type { Incident } from './incident.js';

export type IncidentOperator = {
  id: string;
  email?: string;
};

function copyIncidentWithoutAssignee(incident: Incident): Incident {
  const copy: Incident = {
    id: incident.id,
    title: incident.title,
    source: incident.source,
    severity: incident.severity,
    status: incident.status,
    errorType: incident.errorType,
    metadata: { ...incident.metadata },
    createdAt: incident.createdAt,
    updatedAt: incident.updatedAt,
  };

  if (incident.description !== undefined) {
    copy.description = incident.description;
  }
  if (incident.requestId !== undefined) {
    copy.requestId = incident.requestId;
  }
  if (incident.analysis !== undefined) {
    copy.analysis = incident.analysis;
  }
  if (incident.statusHistory !== undefined) {
    copy.statusHistory = incident.statusHistory.map((entry) => ({
      ...entry,
    }));
  }

  return copy;
}

/**
 * Returns a copy assigned to the given operator. Replaces any previous owner.
 */
export function assignIncident(
  incident: Incident,
  operator: IncidentOperator,
): Incident {
  const id = operator.id.trim();
  if (id.length === 0) {
    throw new Error('assignIncident operator.id must be a non-empty string');
  }

  const next = copyIncidentWithoutAssignee(incident);
  next.assigneeId = id;
  next.updatedAt = new Date().toISOString();

  const email = operator.email?.trim();
  if (email !== undefined && email.length > 0) {
    next.assigneeEmail = email;
  }

  return next;
}
