import type { Incident } from './incident.js';

export type IncidentOperator = {
  id: string;
  email?: string;
};

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

  const next: Incident = {
    ...incident,
    metadata: { ...incident.metadata },
    assigneeId: id,
    updatedAt: new Date().toISOString(),
  };

  const email = operator.email?.trim();
  if (email !== undefined && email.length > 0) {
    next.assigneeEmail = email;
    return next;
  }

  if (next.assigneeEmail === undefined) {
    return next;
  }

  return {
    id: next.id,
    title: next.title,
    source: next.source,
    severity: next.severity,
    status: next.status,
    errorType: next.errorType,
    metadata: next.metadata,
    createdAt: next.createdAt,
    updatedAt: next.updatedAt,
    ...(next.description !== undefined
      ? { description: next.description }
      : {}),
    ...(next.requestId !== undefined ? { requestId: next.requestId } : {}),
    ...(next.analysis !== undefined ? { analysis: next.analysis } : {}),
    assigneeId: id,
  };
}
