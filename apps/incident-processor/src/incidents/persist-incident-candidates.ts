import { createIncident } from '../../../../packages/domain/src/index.js';
import type { IncidentRepository } from '../../../../packages/repository/src/index.js';
import type { Logger } from 'pino';

import type { ParsedIncidentCandidate } from '../cloudwatch/types.js';
import { buildAutomaticIncidentId } from './build-automatic-incident-id.js';
import { mapCandidateToIncidentInput } from './map-candidate-to-incident-input.js';

/**
 * Persistence counters.
 *
 * attemptedIncidents =
 *   persistedIncidents + duplicateIncidents + mappingFailures + persistenceFailures
 *
 * mappingFailures are not also counted as persistenceFailures.
 */
export interface IncidentPersistenceSummary {
  attemptedIncidents: number;
  persistedIncidents: number;
  duplicateIncidents: number;
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
 * Map + createIncident(deterministic id) + repository.saveIfAbsent, sequentially.
 * Duplicates are expected idempotent outcomes, not failures.
 */
export async function persistIncidentCandidates(
  candidates: ParsedIncidentCandidate[],
  deps: PersistIncidentCandidatesDeps,
): Promise<IncidentPersistenceSummary> {
  const summary: IncidentPersistenceSummary = {
    attemptedIncidents: 0,
    persistedIncidents: 0,
    duplicateIncidents: 0,
    mappingFailures: 0,
    persistenceFailures: 0,
    persistedIncidentIds: [],
  };

  for (const candidate of candidates) {
    summary.attemptedIncidents += 1;

    const mapped = mapCandidateToIncidentInput(candidate);
    if (!mapped.ok) {
      summary.mappingFailures += 1;
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

    let incidentId: string;
    try {
      incidentId = buildAutomaticIncidentId(candidate.sourceEventId);
    } catch {
      summary.persistenceFailures += 1;
      deps.log.error(
        {
          sourceEventId: candidate.sourceEventId,
          service: candidate.service ?? 'unknown-service',
          errorCategory: 'incident_id_failure',
          outcome: 'failed',
        },
        'automatic incident id derivation failed',
      );
      continue;
    }

    try {
      const incident = createIncident(mapped.input, { id: incidentId });
      const outcome = await deps.repository.saveIfAbsent(incident);

      if (outcome === 'created') {
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
      } else {
        summary.duplicateIncidents += 1;
        deps.log.info(
          {
            incidentId: incident.id,
            sourceEventId: candidate.sourceEventId,
            outcome: 'duplicate',
          },
          'duplicate automatic incident ignored',
        );
      }
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
