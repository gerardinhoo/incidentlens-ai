import { IncidentAnalysisError } from '../../../../packages/analysis/src/index.js';

/**
 * Reject truncated or unexpected Converse completions.
 * end_turn is the normal successful completion for structured text output.
 */
export function assertConverseStopReason(stopReason: string | undefined): void {
  if (stopReason === 'max_tokens') {
    throw new IncidentAnalysisError(
      'MODEL_OUTPUT_TRUNCATED',
      'Bedrock response was truncated',
    );
  }

  if (stopReason === undefined || stopReason === 'end_turn') {
    return;
  }

  throw new IncidentAnalysisError(
    'INVALID_MODEL_RESPONSE',
    'Bedrock returned an unexpected stop reason',
  );
}
