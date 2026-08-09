import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';

import {
  IncidentAnalysisError,
  type IncidentAnalysis,
  type IncidentAnalysisInput,
  type IncidentAnalyzer,
} from '../../../../packages/analysis/src/index.js';

import { buildIncidentAnalysisPrompt } from './build-incident-analysis-prompt.js';
import { extractConverseText } from './extract-converse-text.js';
import { mapConverseTextToAnalysis } from './map-converse-text-to-analysis.js';

/** Conservative Converse inference settings for concise technical analysis. */
export const BEDROCK_INFERENCE_CONFIG = {
  maxTokens: 400,
  temperature: 0.1,
} as const;

export interface BedrockAnalyzerLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
}

export interface BedrockIncidentAnalyzerOptions {
  /** Injected client (required). Create once at composition/cold-start. */
  client: Pick<BedrockRuntimeClient, 'send'>;
  /** Model ID or inference-profile identifier. */
  modelId: string;
  logger?: BedrockAnalyzerLogger;
  /** Optional Lambda request id for safe operational logs. */
  requestId?: string;
}

/**
 * Bedrock-backed IncidentAnalyzer using the Converse API.
 * Provider-specific — must not be imported by packages/analysis contracts.
 */
export class BedrockIncidentAnalyzer implements IncidentAnalyzer {
  private readonly client: Pick<BedrockRuntimeClient, 'send'>;
  private readonly modelId: string;
  private readonly logger: BedrockAnalyzerLogger | undefined;
  private readonly requestId: string | undefined;

  constructor(options: BedrockIncidentAnalyzerOptions) {
    if (!options.modelId.trim()) {
      throw new Error('BedrockIncidentAnalyzer requires a non-empty modelId');
    }
    this.client = options.client;
    this.modelId = options.modelId.trim();
    this.logger = options.logger;
    this.requestId = options.requestId;
  }

  async analyze(input: IncidentAnalysisInput): Promise<IncidentAnalysis> {
    const prompt = buildIncidentAnalysisPrompt(input);
    const command = new ConverseCommand({
      modelId: this.modelId,
      messages: [
        {
          role: 'user',
          content: [{ text: prompt }],
        },
      ],
      inferenceConfig: {
        maxTokens: BEDROCK_INFERENCE_CONFIG.maxTokens,
        temperature: BEDROCK_INFERENCE_CONFIG.temperature,
      },
    });

    let response: ConverseCommandOutput;
    try {
      response = await this.client.send(command);
    } catch (error) {
      this.logFailure('BEDROCK_INVOCATION_FAILED', input.service);
      throw new IncidentAnalysisError(
        'BEDROCK_INVOCATION_FAILED',
        'Bedrock Converse invocation failed',
        { cause: error },
      );
    }

    let text: string;
    try {
      text = extractConverseText(response);
    } catch (error) {
      if (error instanceof IncidentAnalysisError) {
        this.logFailure(error.category, input.service);
        throw error;
      }
      this.logFailure('INVALID_MODEL_RESPONSE', input.service);
      throw new IncidentAnalysisError(
        'INVALID_MODEL_RESPONSE',
        'Bedrock response could not be interpreted',
        { cause: error },
      );
    }

    let analysis: IncidentAnalysis;
    try {
      analysis = mapConverseTextToAnalysis(text);
    } catch (error) {
      this.logFailure('INVALID_MODEL_RESPONSE', input.service);
      throw new IncidentAnalysisError(
        'INVALID_MODEL_RESPONSE',
        'Bedrock response mapping failed',
        { cause: error },
      );
    }

    this.logSuccess(input.service, response);
    return analysis;
  }

  private logSuccess(service: string, response: ConverseCommandOutput): void {
    if (!this.logger) {
      return;
    }
    const usage = response.usage;
    const payload: Record<string, unknown> = {
      analyzer: 'bedrock',
      modelId: this.modelId,
      service,
      outcome: 'success',
    };
    if (this.requestId) {
      payload.requestId = this.requestId;
    }
    if (usage) {
      if (typeof usage.inputTokens === 'number') {
        payload.inputTokens = usage.inputTokens;
      }
      if (typeof usage.outputTokens === 'number') {
        payload.outputTokens = usage.outputTokens;
      }
      if (typeof usage.totalTokens === 'number') {
        payload.totalTokens = usage.totalTokens;
      }
    }
    // Do not log prompts or response text.
    this.logger.info(payload, 'incident analysis completed');
  }

  private logFailure(category: string, service: string): void {
    if (!this.logger) {
      return;
    }
    const payload: Record<string, unknown> = {
      analyzer: 'bedrock',
      service,
      category,
      outcome: 'failed',
    };
    if (this.requestId) {
      payload.requestId = this.requestId;
    }
    this.logger.info(payload, 'incident analysis failed');
  }
}
