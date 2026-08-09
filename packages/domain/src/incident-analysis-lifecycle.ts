import type { Incident } from './incident.js';
import type { CompletedIncidentAnalysisFields } from './incident-analysis-record.js';

function cloneRecommendedActions(
  actions: readonly string[],
): readonly string[] {
  return [...actions];
}

/**
 * Returns a copy with analysis.status = pending.
 * Does not set analyzedAt. Does not change incident lifecycle status.
 */
export function markIncidentAnalysisPending(incident: Incident): Incident {
  const now = new Date().toISOString();
  return {
    ...incident,
    metadata: { ...incident.metadata },
    analysis: {
      status: 'pending',
    },
    updatedAt: now,
  };
}

/**
 * Returns a copy with completed analysis fields and analyzedAt.
 * Does not change incident lifecycle status / severity / source / title.
 */
export function completeIncidentAnalysis(
  incident: Incident,
  analysis: CompletedIncidentAnalysisFields,
): Incident {
  const now = new Date().toISOString();
  const summary = analysis.summary.trim();
  const possibleCause = analysis.possibleCause.trim();
  const recommendedActions = analysis.recommendedActions
    .map((action) => action.trim())
    .filter((action) => action.length > 0);

  if (
    summary.length === 0 ||
    possibleCause.length === 0 ||
    recommendedActions.length === 0
  ) {
    throw new Error(
      'completeIncidentAnalysis requires non-empty summary, possibleCause, and recommendedActions',
    );
  }

  return {
    ...incident,
    metadata: { ...incident.metadata },
    analysis: {
      status: 'completed',
      summary,
      possibleCause,
      recommendedActions: cloneRecommendedActions(recommendedActions),
      analyzedAt: now,
    },
    updatedAt: now,
  };
}

/**
 * Returns a copy with analysis.status = failed and analyzedAt.
 * Does not invent summary/possibleCause/recommendedActions.
 */
export function failIncidentAnalysis(incident: Incident): Incident {
  const now = new Date().toISOString();
  return {
    ...incident,
    metadata: { ...incident.metadata },
    analysis: {
      status: 'failed',
      analyzedAt: now,
    },
    updatedAt: now,
  };
}
