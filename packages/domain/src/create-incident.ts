import { randomUUID } from 'node:crypto';

import type { CreateIncidentInput, Incident } from './incident.js';

/**
 * Options for trusted internal callers (e.g. processor automatic creation).
 * Not part of CreateIncidentInput — HTTP clients cannot supply an id.
 */
export interface CreateIncidentOptions {
  /**
   * Application-generated incident id. When omitted, a random UUID is used
   * (public API / manual creates).
   */
  id?: string;
}

/**
 * Creates a new incident with open status and ISO 8601 timestamps.
 * Id is a random UUID unless a trusted caller provides options.id.
 */
export function createIncident(
  input: CreateIncidentInput,
  options?: CreateIncidentOptions,
): Incident {
  const now = new Date().toISOString();
  const providedId = options?.id?.trim();
  if (options?.id !== undefined && (!providedId || providedId.length === 0)) {
    throw new Error('createIncident options.id must be a non-empty string');
  }

  const incident: Incident = {
    id: providedId ?? randomUUID(),
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
