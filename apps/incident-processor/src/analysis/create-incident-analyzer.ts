import {
  BedrockRuntimeClient,
  type BedrockRuntimeClientConfig,
} from '@aws-sdk/client-bedrock-runtime';

import {
  FakeIncidentAnalyzer,
  type IncidentAnalyzer,
} from '../../../../packages/analysis/src/index.js';

import {
  BedrockIncidentAnalyzer,
  type BedrockAnalyzerLogger,
} from './bedrock-incident-analyzer.js';

export type IncidentAnalyzerProvider = 'fake' | 'bedrock';

export type CreateIncidentAnalyzerConfig =
  | {
      provider: 'fake';
    }
  | {
      provider: 'bedrock';
      modelId: string;
      region?: string;
      client?: Pick<BedrockRuntimeClient, 'send'>;
      logger?: BedrockAnalyzerLogger;
      clientConfig?: BedrockRuntimeClientConfig;
    };

/**
 * Provider factory — keep selection outside business/persist logic.
 * No silent fallback from bedrock → fake.
 */
export function createIncidentAnalyzer(
  config: CreateIncidentAnalyzerConfig,
): IncidentAnalyzer {
  if (config.provider === 'fake') {
    return new FakeIncidentAnalyzer();
  }

  if (config.provider === 'bedrock') {
    const modelId = config.modelId?.trim();
    if (!modelId) {
      throw new Error(
        'BEDROCK_MODEL_ID is required when INCIDENT_ANALYZER=bedrock',
      );
    }

    const client =
      config.client ??
      new BedrockRuntimeClient({
        region: config.region?.trim() || process.env.AWS_REGION || 'us-east-1',
        ...config.clientConfig,
      });

    const bedrockOptions: ConstructorParameters<
      typeof BedrockIncidentAnalyzer
    >[0] = {
      client,
      modelId,
    };
    if (config.logger) {
      bedrockOptions.logger = config.logger;
    }

    return new BedrockIncidentAnalyzer(bedrockOptions);
  }

  const unknown = config as { provider?: string };
  throw new Error(
    `Invalid INCIDENT_ANALYZER "${unknown.provider ?? ''}". Allowed values: fake, bedrock`,
  );
}
