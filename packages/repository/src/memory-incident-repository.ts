import type { Incident } from '../../domain/src/index.js';

import type {
  IncidentRepository,
  SaveIfAbsentResult,
} from './incident-repository.js';
import { sortIncidentsNewestFirst } from './sort-incidents.js';

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

  if (incident.analysis !== undefined) {
    copy.analysis = {
      status: incident.analysis.status,
      ...(incident.analysis.summary !== undefined
        ? { summary: incident.analysis.summary }
        : {}),
      ...(incident.analysis.possibleCause !== undefined
        ? { possibleCause: incident.analysis.possibleCause }
        : {}),
      ...(incident.analysis.recommendedActions !== undefined
        ? {
            recommendedActions: [...incident.analysis.recommendedActions],
          }
        : {}),
      ...(incident.analysis.analyzedAt !== undefined
        ? { analyzedAt: incident.analysis.analyzedAt }
        : {}),
    };
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

  saveIfAbsent(incident: Incident): Promise<SaveIfAbsentResult> {
    if (this.incidents.has(incident.id)) {
      return Promise.resolve('duplicate');
    }
    this.incidents.set(incident.id, cloneIncident(incident));
    return Promise.resolve('created');
  }

  findById(id: string): Promise<Incident | undefined> {
    const found = this.incidents.get(id);
    return Promise.resolve(
      found === undefined ? undefined : cloneIncident(found),
    );
  }

  findAll(): Promise<Incident[]> {
    const incidents = [...this.incidents.values()].map((incident) =>
      cloneIncident(incident),
    );
    return Promise.resolve(sortIncidentsNewestFirst(incidents));
  }
}
