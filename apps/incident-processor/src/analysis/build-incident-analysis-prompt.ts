import {
  getIncidentAnalysisJsonSchemaString,
  type IncidentAnalysisInput,
} from '../../../../packages/analysis/src/index.js';

/**
 * Production system instructions for structured incident analysis.
 * Keep concise; do not request chain-of-thought.
 *
 * Note: amazon.nova-lite-v1:0 does not support Converse outputConfig JSON Schema.
 * The schema is therefore enforced in-prompt + by parseIncidentAnalysis at runtime.
 */
export function buildIncidentAnalysisSystemPrompt(): string {
  return [
    'You are an SRE incident-analysis assistant.',
    '',
    'Rules:',
    '- Analyze only the supplied operational facts.',
    '- Do not invent evidence that is not present.',
    '- Do not claim a root cause is proven.',
    '- possibleCause must be a plausible hypothesis using language such as "A possible cause is...", "This may indicate...", or "One hypothesis is...".',
    '- recommendedActions are investigation steps, not destructive remediation.',
    '- Prefer cautious language when evidence is missing; uncertainty is better than fabrication.',
    '- Do not request or expose secrets or credentials.',
    '- Do not suggest disabling security controls, deleting data, or destructive infrastructure changes.',
    '- Do not include Markdown headings or code fences.',
    '- Keep responses concise and operational.',
    '- Do not provide hidden reasoning or chain-of-thought.',
    '- Respond with a single JSON object only. No prose before or after the JSON.',
    '',
    'JSON Schema:',
    getIncidentAnalysisJsonSchemaString(),
  ].join('\n');
}

/** Stable export for semantic tests. */
export const INCIDENT_ANALYSIS_SYSTEM_PROMPT =
  buildIncidentAnalysisSystemPrompt();

/**
 * Builds the user message from allow-listed IncidentAnalysisInput fields only.
 * Never JSON.stringify an arbitrary incident/candidate object.
 */
export function buildIncidentAnalysisUserContent(
  input: IncidentAnalysisInput,
): string {
  const lines: string[] = [
    'Operational facts:',
    `Service: ${input.service}`,
    `Severity: ${input.severity}`,
    `Error type: ${input.errorType}`,
  ];

  if (
    typeof input.statusCode === 'number' &&
    Number.isFinite(input.statusCode)
  ) {
    lines.push(`HTTP status: ${input.statusCode}`);
  }

  const route = input.route?.trim();
  if (route) {
    lines.push(`Route: ${route}`);
  }

  const environment = input.environment?.trim();
  if (environment) {
    lines.push(`Environment: ${environment}`);
  }

  const safeMessage = input.safeMessage?.trim();
  if (safeMessage) {
    lines.push(`Safe message: ${safeMessage}`);
  }

  return lines.join('\n');
}
