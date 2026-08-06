import { createIncident } from '../../../../packages/domain/src/index.js';
import type { IncidentRepository } from '../../../../packages/repository/src/index.js';
import type { Logger } from 'pino';

import type { ParsedIncidentCandidate } from '../cloudwatch/types.js';
import { mapCandidateToIncidentInput } from './map-candidate-to-incident-input.js';

export interface IncidentPersistenceSummary {
  attemptedIncidents: number;
  persistedIncidents: number;
  mappingFailures: number;
  persistenceFailures: number;
  /** Internal test aid — not logged as a bulk array. */
  persistedIncidentIds: string[];
}

export interface PersistIncidentCandidatesDeps {
  repository: IncidentRepository;
  log: Logger;
}

/**
 * Map + createIncident + repository.save for each candidate, sequentially.
 * One failure does not stop later candidates.
 *
 * SCRUM-34: duplicate CloudWatch deliveries may create duplicate incidents.
 * Idempotency is SCRUM-35.
 */
export async function persistIncidentCandidates(
  candidates: ParsedIncidentCandidate[],
  deps: PersistIncidentCandidatesDeps,
): Promise<IncidentPersistenceSummary> {
  const summary: IncidentPersistenceSummary = {
    attemptedIncidents: 0,
    persistedIncidents: 0,
    mappingFailures: 0,
    persistenceFailures: 0,
    persistedIncidentIds: [],
  };

  for (const candidate of candidates) {
    summary.attemptedIncidents += 1;

    const mapped = mapCandidateToIncidentInput(candidate);
    if (!mapped.ok) {
      summary.mappingFailures += 1;
      summary.persistenceFailures += 1;
      deps.log.error(
        {
          sourceEventId: candidate.sourceEventId,
          service: candidate.service ?? 'unknown-service',
          errorCategory: 'mapping_failure',
          outcome: 'failed',
        },
        'automatic incident mapping failed',
      );
      continue;
    }

    try {
      const incident = createIncident(mapped.input);
      await deps.repository.save(incident);
      summary.persistedIncidents += 1;
      summary.persistedIncidentIds.push(incident.id);

      deps.log.info(
        {
          incidentId: incident.id,
          sourceEventId: candidate.sourceEventId,
          source: incident.source,
          severity: incident.severity,
          outcome: 'persisted',
        },
        'automatic incident persisted',
      );
    } catch {
      summary.persistenceFailures += 1;
      deps.log.error(
        {
          sourceEventId: candidate.sourceEventId,
          service: candidate.service ?? 'unknown-service',
          errorCategory: 'repository_save_failure',
          outcome: 'failed',
        },
        'automatic incident persistence failed',
      );
    }
  }

  return summary;
}
