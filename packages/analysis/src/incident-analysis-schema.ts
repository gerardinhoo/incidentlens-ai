import { INCIDENT_ANALYSIS_BOUNDS } from './incident-analysis.js';

/**
 * JSON Schema for Bedrock Converse structured outputs and documentation.
 * Bounds are derived from INCIDENT_ANALYSIS_BOUNDS (single source of truth).
 */
export const INCIDENT_ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'possibleCause', 'recommendedActions'],
  properties: {
    summary: {
      type: 'string',
      minLength: 1,
      maxLength: INCIDENT_ANALYSIS_BOUNDS.summaryMaxLength,
    },
    possibleCause: {
      type: 'string',
      minLength: 1,
      maxLength: INCIDENT_ANALYSIS_BOUNDS.possibleCauseMaxLength,
    },
    recommendedActions: {
      type: 'array',
      minItems: INCIDENT_ANALYSIS_BOUNDS.recommendedActionsMin,
      maxItems: INCIDENT_ANALYSIS_BOUNDS.recommendedActionsMax,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: INCIDENT_ANALYSIS_BOUNDS.actionMaxLength,
      },
    },
  },
} as const;

export const INCIDENT_ANALYSIS_SCHEMA_NAME = 'incident_analysis';

export const INCIDENT_ANALYSIS_SCHEMA_DESCRIPTION =
  'Structured SRE incident analysis with summary, hypothesis, and investigation steps';

/** Serialized schema string for Bedrock outputConfig.jsonSchema.schema */
export function getIncidentAnalysisJsonSchemaString(): string {
  return JSON.stringify(INCIDENT_ANALYSIS_JSON_SCHEMA);
}
