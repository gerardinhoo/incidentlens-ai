import { randomUUID } from 'node:crypto';

import type { CreateIncidentInput, Incident } from './incident.js';

/**
 * Creates a new incident with generated id, open status, and ISO 8601 timestamps.
 */
export function createIncident(input: CreateIncidentInput): Incident {
  const now = new Date().toISOString();

  const incident: Incident = {
    id: randomUUID(),
    title: input.title,
    source: input.source,
    severity: input.severity,
    status: 'open',
    errorType: input.errorType,
    metadata: { ...(input.metadata ?? {}) },
    createdAt: now,
    updatedAt: now,
  };

  if (input.description !== undefined) {
    incident.description = input.description;
  }

  if (input.requestId !== undefined) {
    incident.requestId = input.requestId;
  }

  return incident;
}
