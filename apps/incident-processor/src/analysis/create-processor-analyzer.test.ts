import { afterEach, describe, expect, it } from 'vitest';

import { FakeIncidentAnalyzer } from '../../../../packages/analysis/src/index.js';

import { loadProcessorConfig, resetProcessorConfigCache } from '../config.js';
import { BedrockIncidentAnalyzer } from './bedrock-incident-analyzer.js';
import {
  getProcessorAnalyzer,
  resetProcessorAnalyzerCache,
  resolveProcessorAnalyzerConfig,
} from './create-processor-analyzer.js';

afterEach(() => {
  resetProcessorConfigCache();
  resetProcessorAnalyzerCache();
});

describe('processor analyzer config', () => {
  it('defaults to fake without requiring a model ID', () => {
    const config = loadProcessorConfig({});
    expect(config.incidentAnalyzer).toBe('fake');
    expect(config.bedrockModelId).toBeUndefined();
    expect(resolveProcessorAnalyzerConfig(config)).toEqual({
      provider: 'fake',
    });
  });

  it('requires BEDROCK_MODEL_ID when INCIDENT_ANALYZER=bedrock', () => {
    expect(() => loadProcessorConfig({ INCIDENT_ANALYZER: 'bedrock' })).toThrow(
      /BEDROCK_MODEL_ID is required/,
    );
  });

  it('accepts bedrock with model ID and resolves factory config', () => {
    const config = loadProcessorConfig({
      INCIDENT_ANALYZER: 'bedrock',
      BEDROCK_MODEL_ID: 'amazon.nova-lite-v1:0',
      BEDROCK_REGION: 'us-west-2',
    });
    expect(config.incidentAnalyzer).toBe('bedrock');
    expect(resolveProcessorAnalyzerConfig(config)).toEqual({
      provider: 'bedrock',
      modelId: 'amazon.nova-lite-v1:0',
      region: 'us-west-2',
    });
  });

  it('rejects invalid analyzer providers without silent fallback', () => {
    expect(() => loadProcessorConfig({ INCIDENT_ANALYZER: 'openai' })).toThrow(
      /Invalid INCIDENT_ANALYZER/,
    );
  });

  it('caches fake analyzer from getProcessorAnalyzer', () => {
    const config = loadProcessorConfig({ INCIDENT_ANALYZER: 'fake' });
    const first = getProcessorAnalyzer(config);
    const second = getProcessorAnalyzer(config);
    expect(first).toBe(second);
    expect(first).toBeInstanceOf(FakeIncidentAnalyzer);
  });

  it('does not construct Bedrock analyzer when provider is fake', () => {
    const config = loadProcessorConfig({
      INCIDENT_ANALYZER: 'fake',
      BEDROCK_MODEL_ID: 'amazon.nova-lite-v1:0',
    });
    const analyzer = getProcessorAnalyzer(config);
    expect(analyzer).toBeInstanceOf(FakeIncidentAnalyzer);
    expect(analyzer).not.toBeInstanceOf(BedrockIncidentAnalyzer);
  });
});
