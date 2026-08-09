import {
  INCIDENT_ANALYSIS_BOUNDS,
  type IncidentAnalysis,
} from './incident-analysis.js';
import { IncidentAnalysisError } from './incident-analysis-error.js';

const ALLOWED_KEYS = new Set([
  'summary',
  'possibleCause',
  'recommendedActions',
]);

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function reject(message: string): never {
  throw new IncidentAnalysisError('INVALID_MODEL_RESPONSE', message);
}

/**
 * Runtime parser for untrusted model (or fake) analysis objects.
 * Never use TypeScript casts alone for external model output.
 */
export function parseIncidentAnalysis(value: unknown): IncidentAnalysis {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    reject('Analysis must be a non-null object');
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      reject('Analysis contains unexpected fields');
    }
  }

  for (const required of ALLOWED_KEYS) {
    if (!(required in record)) {
      reject(`Analysis missing required field: ${required}`);
    }
  }

  if (typeof record.summary !== 'string') {
    reject('summary must be a string');
  }
  if (typeof record.possibleCause !== 'string') {
    reject('possibleCause must be a string');
  }
  if (!Array.isArray(record.recommendedActions)) {
    reject('recommendedActions must be an array');
  }

  const summary = normalizeWhitespace(record.summary);
  const possibleCause = normalizeWhitespace(record.possibleCause);

  if (summary.length === 0) {
    reject('summary must be non-empty');
  }
  if (possibleCause.length === 0) {
    reject('possibleCause must be non-empty');
  }
  if (summary.length > INCIDENT_ANALYSIS_BOUNDS.summaryMaxLength) {
    reject('summary exceeds maximum length');
  }
  if (possibleCause.length > INCIDENT_ANALYSIS_BOUNDS.possibleCauseMaxLength) {
    reject('possibleCause exceeds maximum length');
  }

  const actionsRaw = record.recommendedActions;
  if (
    actionsRaw.length < INCIDENT_ANALYSIS_BOUNDS.recommendedActionsMin ||
    actionsRaw.length > INCIDENT_ANALYSIS_BOUNDS.recommendedActionsMax
  ) {
    reject('recommendedActions count is out of bounds');
  }

  const recommendedActions: string[] = [];
  for (const action of actionsRaw) {
    if (typeof action !== 'string') {
      reject('recommendedActions items must be strings');
    }
    const normalized = normalizeWhitespace(action);
    if (normalized.length === 0) {
      reject('recommendedActions items must be non-empty');
    }
    if (normalized.length > INCIDENT_ANALYSIS_BOUNDS.actionMaxLength) {
      reject('recommendedActions item exceeds maximum length');
    }
    recommendedActions.push(normalized);
  }

  return {
    summary,
    possibleCause,
    recommendedActions,
  };
}

/**
 * Narrow unwrap for optional Markdown JSON fences, then parse + validate.
 * Prefer native Bedrock structured outputs; this only handles a full-document fence.
 */
export function parseIncidentAnalysisJsonText(text: string): IncidentAnalysis {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new IncidentAnalysisError(
      'EMPTY_MODEL_RESPONSE',
      'Bedrock returned empty analysis text',
    );
  }

  const fenced = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  const fencedBody = fenced?.[1];
  const jsonText = typeof fencedBody === 'string' ? fencedBody.trim() : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch (error) {
    throw new IncidentAnalysisError(
      'INVALID_MODEL_RESPONSE',
      'Bedrock returned malformed JSON',
      { cause: error },
    );
  }

  return parseIncidentAnalysis(parsed);
}
