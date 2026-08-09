import type { Incident } from '../../domain/src/index.js';

import type { IncidentNotificationInput } from './incident-notification-input.js';

/**
 * Map a domain Incident to the allow-listed notification contract.
 * Includes analysis fields only when status is completed with validated values.
 */
export function mapIncidentToNotificationInput(
  incident: Incident,
): IncidentNotificationInput {
  const input: IncidentNotificationInput = {
    incidentId: incident.id,
    title: incident.title,
    source: incident.source,
    severity: incident.severity,
    status: incident.status,
    createdAt: incident.createdAt,
  };

  const analysis = incident.analysis;
  if (
    analysis?.status === 'completed' &&
    typeof analysis.summary === 'string' &&
    typeof analysis.possibleCause === 'string' &&
    Array.isArray(analysis.recommendedActions) &&
    analysis.recommendedActions.length > 0 &&
    analysis.recommendedActions.every((action) => typeof action === 'string')
  ) {
    input.analysis = {
      summary: analysis.summary,
      possibleCause: analysis.possibleCause,
      recommendedActions: analysis.recommendedActions.map(String),
    };
  }

  return input;
}
