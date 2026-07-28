import type { Incident } from '../../domain/src/index.js';

import type { IncidentRepository } from './incident-repository.js';

function cloneIncident(incident: Incident): Incident {
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

  return copy;
}

/**
 * In-memory IncidentRepository for local development and tests.
 */
export class MemoryIncidentRepository implements IncidentRepository {
  private readonly incidents = new Map<string, Incident>();

  save(incident: Incident): Promise<Incident> {
    const stored = cloneIncident(incident);
    this.incidents.set(stored.id, stored);
    return Promise.resolve(cloneIncident(stored));
  }

  findById(id: string): Promise<Incident | undefined> {
    const found = this.incidents.get(id);
    return Promise.resolve(
      found === undefined ? undefined : cloneIncident(found),
    );
  }

  findAll(): Promise<Incident[]> {
    return Promise.resolve(
      [...this.incidents.values()].map((incident) => cloneIncident(incident)),
    );
  }
}
