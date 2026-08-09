import { describe, expect, it } from 'vitest';

import {
  INCIDENT_ANALYSIS_BOUNDS,
  INCIDENT_ANALYSIS_JSON_SCHEMA,
  IncidentAnalysisError,
  parseIncidentAnalysis,
  parseIncidentAnalysisJsonText,
} from './index.js';

const valid = {
  summary: 'The payments service returned HTTP 500 on checkout.',
  possibleCause:
    'A possible cause is a dependency timeout under elevated load.',
  recommendedActions: [
    'Inspect recent application logs for the failing route.',
    'Check dependency health and latency metrics.',
  ],
};

describe('INCIDENT_ANALYSIS_JSON_SCHEMA', () => {
  it('requires the analysis fields and forbids additional properties', () => {
    expect(INCIDENT_ANALYSIS_JSON_SCHEMA.type).toBe('object');
    expect(INCIDENT_ANALYSIS_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(INCIDENT_ANALYSIS_JSON_SCHEMA.required).toEqual([
      'summary',
      'possibleCause',
      'recommendedActions',
    ]);
    expect(INCIDENT_ANALYSIS_JSON_SCHEMA.properties.summary.maxLength).toBe(
      INCIDENT_ANALYSIS_BOUNDS.summaryMaxLength,
    );
    expect(
      INCIDENT_ANALYSIS_JSON_SCHEMA.properties.possibleCause.maxLength,
    ).toBe(INCIDENT_ANALYSIS_BOUNDS.possibleCauseMaxLength);
    expect(
      INCIDENT_ANALYSIS_JSON_SCHEMA.properties.recommendedActions.minItems,
    ).toBe(INCIDENT_ANALYSIS_BOUNDS.recommendedActionsMin);
    expect(
      INCIDENT_ANALYSIS_JSON_SCHEMA.properties.recommendedActions.maxItems,
    ).toBe(INCIDENT_ANALYSIS_BOUNDS.recommendedActionsMax);
    expect(
      INCIDENT_ANALYSIS_JSON_SCHEMA.properties.recommendedActions.items
        .maxLength,
    ).toBe(INCIDENT_ANALYSIS_BOUNDS.actionMaxLength);
  });
});

describe('parseIncidentAnalysis', () => {
  it('accepts a valid analysis object', () => {
    expect(parseIncidentAnalysis(valid)).toEqual(valid);
  });

  it('trims and normalizes whitespace', () => {
    expect(
      parseIncidentAnalysis({
        summary: '  Two   spaces  ',
        possibleCause: ' A possible cause is X. ',
        recommendedActions: ['  Check logs.  '],
      }),
    ).toEqual({
      summary: 'Two spaces',
      possibleCause: 'A possible cause is X.',
      recommendedActions: ['Check logs.'],
    });
  });

  it('rejects missing fields', () => {
    expect(() =>
      parseIncidentAnalysis({
        possibleCause: valid.possibleCause,
        recommendedActions: valid.recommendedActions,
      }),
    ).toThrow(/missing required field: summary/);
    expect(() =>
      parseIncidentAnalysis({
        summary: valid.summary,
        recommendedActions: valid.recommendedActions,
      }),
    ).toThrow(/missing required field: possibleCause/);
    expect(() =>
      parseIncidentAnalysis({
        summary: valid.summary,
        possibleCause: valid.possibleCause,
      }),
    ).toThrow(/missing required field: recommendedActions/);
  });

  it('rejects empty, whitespace-only, and oversized strings', () => {
    expect(() => parseIncidentAnalysis({ ...valid, summary: '' })).toThrow(
      /summary must be non-empty/,
    );
    expect(() => parseIncidentAnalysis({ ...valid, summary: '   ' })).toThrow(
      /summary must be non-empty/,
    );
    expect(() =>
      parseIncidentAnalysis({ ...valid, possibleCause: '\n\t' }),
    ).toThrow(/possibleCause must be non-empty/);
    expect(() =>
      parseIncidentAnalysis({
        ...valid,
        summary: 'x'.repeat(INCIDENT_ANALYSIS_BOUNDS.summaryMaxLength + 1),
      }),
    ).toThrow(/summary exceeds maximum length/);
  });

  it('rejects invalid recommendedActions shapes', () => {
    expect(() =>
      parseIncidentAnalysis({ ...valid, recommendedActions: [] }),
    ).toThrow(/recommendedActions count is out of bounds/);
    expect(() =>
      parseIncidentAnalysis({
        ...valid,
        recommendedActions: Array.from({ length: 6 }, (_, i) => `Action ${i}`),
      }),
    ).toThrow(/recommendedActions count is out of bounds/);
    expect(() =>
      parseIncidentAnalysis({
        ...valid,
        recommendedActions: [123 as unknown as string],
      }),
    ).toThrow(/recommendedActions items must be strings/);
    expect(() =>
      parseIncidentAnalysis({
        ...valid,
        recommendedActions: ['   '],
      }),
    ).toThrow(/recommendedActions items must be non-empty/);
  });

  it('rejects unexpected fields and non-object roots', () => {
    expect(() => parseIncidentAnalysis({ ...valid, confidence: 0.9 })).toThrow(
      /unexpected fields/,
    );
    expect(() => parseIncidentAnalysis(null)).toThrow(/non-null object/);
    expect(() => parseIncidentAnalysis([])).toThrow(/non-null object/);
    expect(() => parseIncidentAnalysis('summary')).toThrow(/non-null object/);
  });
});

describe('parseIncidentAnalysisJsonText', () => {
  it('parses raw JSON text', () => {
    expect(parseIncidentAnalysisJsonText(JSON.stringify(valid))).toEqual(valid);
  });

  it('supports a narrow full-document Markdown fence fallback', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``;
    expect(parseIncidentAnalysisJsonText(fenced)).toEqual(valid);
  });

  it('rejects malformed JSON without repair', () => {
    expect(() => parseIncidentAnalysisJsonText('{summary:')).toThrow(
      IncidentAnalysisError,
    );
    expect(() => parseIncidentAnalysisJsonText('{summary:')).toThrow(
      /malformed JSON/,
    );
  });

  it('rejects empty text', () => {
    expect(() => parseIncidentAnalysisJsonText('   ')).toThrow(
      /empty analysis text/,
    );
  });
});
