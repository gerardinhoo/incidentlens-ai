import {
  INCIDENT_ANALYSIS_BOUNDS,
  type IncidentAnalysis,
} from '../../../../packages/analysis/src/index.js';

/**
 * Temporary SCRUM-38 mapping from unstructured Converse prose into
 * IncidentAnalysis. SCRUM-39 will replace this with structured parsing
 * and runtime validation — do not invent root causes from free text.
 */
export function mapConverseTextToAnalysis(text: string): IncidentAnalysis {
  const summary = text
    .trim()
    .slice(0, INCIDENT_ANALYSIS_BOUNDS.summaryMaxLength);
  if (summary.length === 0) {
    throw new Error('Cannot map empty model text to IncidentAnalysis');
  }

  return {
    summary,
    possibleCause: 'AI analysis requires structured parsing in SCRUM-39.',
    recommendedActions: [
      'Review the AI summary; structured actions arrive in SCRUM-39.',
    ],
  };
}
