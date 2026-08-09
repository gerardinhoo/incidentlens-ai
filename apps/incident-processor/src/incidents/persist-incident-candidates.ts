import {
  completeIncidentAnalysis,
  createIncident,
  failIncidentAnalysis,
  markIncidentAnalysisPending,
} from '../../../../packages/domain/src/index.js';
import type { IncidentRepository } from '../../../../packages/repository/src/index.js';
import {
  IncidentAnalysisError,
  type IncidentAnalyzer,
} from '../../../../packages/analysis/src/index.js';
import type { Logger } from 'pino';

import { mapIncidentToAnalysisInput } from '../analysis/map-incident-to-analysis-input.js';
import type { ParsedIncidentCandidate } from '../cloudwatch/types.js';
import { buildAutomaticIncidentId } from './build-automatic-incident-id.js';
import { mapCandidateToIncidentInput } from './map-candidate-to-incident-input.js';

/**
 * Persistence + AI enrichment counters.
 *
 * attemptedIncidents =
 *   persistedIncidents + duplicateIncidents + mappingFailures + persistenceFailures
 *
 * analysisAttempts counts newly created incidents sent to the analyzer.
 * analyzedIncidents + analysisFailures (+ analysisPersistenceFailures overlap)
 * are enrichment outcomes and do not affect incident creation success.
 */
export interface IncidentPersistenceSummary {
  attemptedIncidents: number;
  persistedIncidents: number;
  duplicateIncidents: number;
  mappingFailures: number;
  persistenceFailures: number;
  analysisAttempts: number;
  analyzedIncidents: number;
  analysisFailures: number;
  analysisPersistenceFailures: number;
  /** Internal test aid — not logged as a bulk array. */
  persistedIncidentIds: string[];
}

export interface PersistIncidentCandidatesDeps {
  repository: IncidentRepository;
  analyzer: IncidentAnalyzer;
  log: Logger;
  /** Safe label for logs: fake | bedrock */
  analyzerName?: string;
}

function analysisErrorCategory(error: unknown): string {
  if (error instanceof IncidentAnalysisError) {
    return error.category;
  }
  return 'ANALYSIS_FAILED';
}

/**
 * Map + createIncident(deterministic id) + saveIfAbsent.
 * On create: mark analysis pending, analyze, then save completed/failed.
 * Duplicates skip analyzer (no repeated AI cost).
 */
export async function persistIncidentCandidates(
  candidates: ParsedIncidentCandidate[],
  deps: PersistIncidentCandidatesDeps,
): Promise<IncidentPersistenceSummary> {
  const analyzerName = deps.analyzerName ?? 'unknown';
  const summary: IncidentPersistenceSummary = {
    attemptedIncidents: 0,
    persistedIncidents: 0,
    duplicateIncidents: 0,
    mappingFailures: 0,
    persistenceFailures: 0,
    analysisAttempts: 0,
    analyzedIncidents: 0,
    analysisFailures: 0,
    analysisPersistenceFailures: 0,
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

    let pendingIncident;
    try {
      const created = createIncident(mapped.input, { id: incidentId });
      pendingIncident = markIncidentAnalysisPending(created);
      const outcome = await deps.repository.saveIfAbsent(pendingIncident);

      if (outcome === 'duplicate') {
        summary.duplicateIncidents += 1;
        deps.log.info(
          {
            incidentId: pendingIncident.id,
            sourceEventId: candidate.sourceEventId,
            outcome: 'duplicate',
          },
          'duplicate automatic incident ignored',
        );
        continue;
      }

      summary.persistedIncidents += 1;
      summary.persistedIncidentIds.push(pendingIncident.id);
      deps.log.info(
        {
          incidentId: pendingIncident.id,
          sourceEventId: candidate.sourceEventId,
          source: pendingIncident.source,
          severity: pendingIncident.severity,
          analysisStatus: 'pending',
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
      continue;
    }

    // Enrichment only for newly created incidents (create-before-analyze).
    summary.analysisAttempts += 1;
    try {
      const analysisInput = mapIncidentToAnalysisInput(
        pendingIncident,
        candidate,
      );
      const analysis = await deps.analyzer.analyze(analysisInput);
      const completed = completeIncidentAnalysis(pendingIncident, analysis);

      try {
        await deps.repository.save(completed);
        summary.analyzedIncidents += 1;
        deps.log.info(
          {
            incidentId: completed.id,
            analyzer: analyzerName,
            analysisStatus: 'completed',
            outcome: 'success',
          },
          'incident analysis persisted',
        );
      } catch {
        summary.analysisPersistenceFailures += 1;
        deps.log.error(
          {
            incidentId: pendingIncident.id,
            analyzer: analyzerName,
            errorCategory: 'analysis_persistence_failure',
            analysisStatus: 'completed',
            outcome: 'failed',
          },
          'incident analysis persistence failed',
        );
      }
    } catch (error) {
      summary.analysisFailures += 1;
      const category = analysisErrorCategory(error);
      const failed = failIncidentAnalysis(pendingIncident);

      try {
        await deps.repository.save(failed);
        deps.log.error(
          {
            incidentId: failed.id,
            analyzer: analyzerName,
            errorCategory: category,
            analysisStatus: 'failed',
            outcome: 'failed',
          },
          'incident analysis failed',
        );
      } catch {
        summary.analysisPersistenceFailures += 1;
        deps.log.error(
          {
            incidentId: pendingIncident.id,
            analyzer: analyzerName,
            errorCategory: 'analysis_persistence_failure',
            analysisStatus: 'failed',
            outcome: 'failed',
          },
          'incident analysis persistence failed',
        );
      }
    }
  }

  return summary;
}
