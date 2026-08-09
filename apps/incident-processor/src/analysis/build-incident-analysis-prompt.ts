import type { IncidentAnalysisInput } from '../../../../packages/analysis/src/index.js';

/**
 * Temporary prompt for SCRUM-38 provider integration.
 * SCRUM-39 owns final prompt design and structured-output instructions.
 *
 * Builds explicitly from allow-listed fields only — never JSON.stringify(input).
 */
export function buildIncidentAnalysisPrompt(
  input: IncidentAnalysisInput,
): string {
  const lines: string[] = [
    'You are assisting an SRE investigating an application incident.',
    '',
    'Analyze only the operational facts below.',
    'Do not claim certainty about a root cause.',
    'Return a concise explanation and suggested investigation steps.',
    'Do not request secrets, credentials, or infrastructure-changing commands.',
    '',
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
