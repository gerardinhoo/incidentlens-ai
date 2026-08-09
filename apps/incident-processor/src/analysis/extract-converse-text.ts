import { IncidentAnalysisError } from '../../../../packages/analysis/src/index.js';

/** Maximum retained model text before temporary IncidentAnalysis mapping. */
export const MAX_CONVERSE_TEXT_LENGTH = 2000;

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return value.slice(0, max);
}

function readContentBlocks(response: unknown): unknown[] | undefined {
  if (typeof response !== 'object' || response === null) {
    return undefined;
  }
  if (!('output' in response)) {
    return undefined;
  }
  const output = (response as { output?: unknown }).output;
  if (typeof output !== 'object' || output === null || !('message' in output)) {
    return undefined;
  }
  const message = (output as { message?: unknown }).message;
  if (
    typeof message !== 'object' ||
    message === null ||
    !('content' in message)
  ) {
    return undefined;
  }
  const content = (message as { content?: unknown }).content;
  return Array.isArray(content) ? content : undefined;
}

/**
 * Safely extract concatenated text blocks from a Converse response.
 * Does not assume content[0].text exists.
 */
export function extractConverseText(response: unknown): string {
  const content = readContentBlocks(response);
  if (!content || content.length === 0) {
    throw new IncidentAnalysisError(
      'EMPTY_MODEL_RESPONSE',
      'Bedrock returned no message content',
    );
  }

  const texts: string[] = [];
  for (const block of content) {
    if (
      block !== undefined &&
      typeof block === 'object' &&
      block !== null &&
      'text' in block &&
      typeof (block as { text?: unknown }).text === 'string'
    ) {
      const trimmed = (block as { text: string }).text.trim();
      if (trimmed.length > 0) {
        texts.push(trimmed);
      }
    }
  }

  if (texts.length === 0) {
    throw new IncidentAnalysisError(
      'EMPTY_MODEL_RESPONSE',
      'Bedrock returned no text content',
    );
  }

  return truncate(texts.join('\n'), MAX_CONVERSE_TEXT_LENGTH);
}
