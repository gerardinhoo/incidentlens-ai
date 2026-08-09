import type { IncidentAnalyzer } from '../../../../packages/analysis/src/index.js';

import type { ProcessorConfig } from '../config.js';
import { createIncidentAnalyzer } from './create-incident-analyzer.js';

let cachedAnalyzer: IncidentAnalyzer | undefined;

/**
 * Resolve analyzer factory config from processor env/config.
 * Does not invoke analyze() — composition helper only.
 */
export function resolveProcessorAnalyzerConfig(
  config: ProcessorConfig,
):
  | { provider: 'fake' }
  | { provider: 'bedrock'; modelId: string; region: string } {
  if (config.incidentAnalyzer === 'fake') {
    return { provider: 'fake' };
  }

  const modelId = config.bedrockModelId?.trim();
  if (!modelId) {
    throw new Error(
      'BEDROCK_MODEL_ID is required when INCIDENT_ANALYZER=bedrock',
    );
  }

  return {
    provider: 'bedrock',
    modelId,
    region:
      config.bedrockRegion?.trim() ||
      process.env.AWS_REGION?.trim() ||
      'us-east-1',
  };
}

/**
 * Cold-start cached analyzer for Lambda composition.
 * SCRUM-38 does not call analyze() from the CloudWatch pipeline.
 */
export function getProcessorAnalyzer(
  config: ProcessorConfig,
): IncidentAnalyzer {
  if (!cachedAnalyzer) {
    cachedAnalyzer = createIncidentAnalyzer(
      resolveProcessorAnalyzerConfig(config),
    );
  }
  return cachedAnalyzer;
}

/** Test helper. */
export function resetProcessorAnalyzerCache(): void {
  cachedAnalyzer = undefined;
}
