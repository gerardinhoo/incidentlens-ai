import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';

import {
  INCIDENT_ANALYSIS_SCHEMA_DESCRIPTION,
  INCIDENT_ANALYSIS_SCHEMA_NAME,
  IncidentAnalysisError,
  getIncidentAnalysisJsonSchemaString,
  parseIncidentAnalysisJsonText,
  type IncidentAnalysis,
  type IncidentAnalysisInput,
  type IncidentAnalyzer,
} from '../../../../packages/analysis/src/index.js';

import { assertConverseStopReason } from './assert-converse-stop-reason.js';
import {
  buildIncidentAnalysisSystemPrompt,
  buildIncidentAnalysisUserContent,
} from './build-incident-analysis-prompt.js';
import { extractConverseText } from './extract-converse-text.js';

/** Conservative Converse settings for structured JSON analysis. */
export const BEDROCK_INFERENCE_CONFIG = {
  maxTokens: 350,
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
  /**
   * When true, send Converse outputConfig.json_schema.
   * Default false: amazon.nova-lite-v1:0 rejects outputConfig.
   * Runtime validation always runs regardless.
   */
  nativeStructuredOutput?: boolean;
}

/**
 * Bedrock-backed IncidentAnalyzer using Converse.
 *
 * For the currently configured Nova Lite model, native Converse structured
 * outputs (outputConfig) are unavailable — JSON is requested via prompt and
 * always validated by parseIncidentAnalysisJsonText.
 */
export class BedrockIncidentAnalyzer implements IncidentAnalyzer {
  private readonly client: Pick<BedrockRuntimeClient, 'send'>;
  private readonly modelId: string;
  private readonly logger: BedrockAnalyzerLogger | undefined;
  private readonly requestId: string | undefined;
  private readonly nativeStructuredOutput: boolean;

  constructor(options: BedrockIncidentAnalyzerOptions) {
    if (!options.modelId.trim()) {
      throw new Error('BedrockIncidentAnalyzer requires a non-empty modelId');
    }
    this.client = options.client;
    this.modelId = options.modelId.trim();
    this.logger = options.logger;
    this.requestId = options.requestId;
    this.nativeStructuredOutput = options.nativeStructuredOutput === true;
  }

  async analyze(input: IncidentAnalysisInput): Promise<IncidentAnalysis> {
    const userContent = buildIncidentAnalysisUserContent(input);
    const commandInput: ConverseCommandInput = {
      modelId: this.modelId,
      system: [{ text: buildIncidentAnalysisSystemPrompt() }],
      messages: [
        {
          role: 'user',
          content: [{ text: userContent }],
        },
      ],
      inferenceConfig: {
        maxTokens: BEDROCK_INFERENCE_CONFIG.maxTokens,
        temperature: BEDROCK_INFERENCE_CONFIG.temperature,
      },
    };

    if (this.nativeStructuredOutput) {
      commandInput.outputConfig = {
        textFormat: {
          type: 'json_schema',
          structure: {
            jsonSchema: {
              schema: getIncidentAnalysisJsonSchemaString(),
              name: INCIDENT_ANALYSIS_SCHEMA_NAME,
              description: INCIDENT_ANALYSIS_SCHEMA_DESCRIPTION,
            },
          },
        },
      };
    }

    const command = new ConverseCommand(commandInput);

    let response: ConverseCommandOutput;
    try {
      response = await this.client.send(command);
    } catch (error) {
      this.logFailure('BEDROCK_INVOCATION_FAILED', input.service, undefined);
      throw new IncidentAnalysisError(
        'BEDROCK_INVOCATION_FAILED',
        'Bedrock Converse invocation failed',
        { cause: error },
      );
    }

    try {
      assertConverseStopReason(response.stopReason);
      const text = extractConverseText(response);
      const analysis = parseIncidentAnalysisJsonText(text);
      this.logSuccess(input.service, response);
      return analysis;
    } catch (error) {
      if (error instanceof IncidentAnalysisError) {
        this.logFailure(error.category, input.service, response.stopReason);
        throw error;
      }
      this.logFailure(
        'INVALID_MODEL_RESPONSE',
        input.service,
        response.stopReason,
      );
      throw new IncidentAnalysisError(
        'INVALID_MODEL_RESPONSE',
        'Bedrock response could not be validated',
        { cause: error },
      );
    }
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
      structuredOutputMode: this.nativeStructuredOutput ? 'native' : 'prompt',
    };
    if (this.requestId) {
      payload.requestId = this.requestId;
    }
    if (response.stopReason) {
      payload.stopReason = response.stopReason;
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
    // Do not log prompts, analysis text, or raw response bodies.
    this.logger.info(payload, 'incident analysis completed');
  }

  private logFailure(
    category: string,
    service: string,
    stopReason: string | undefined,
  ): void {
    if (!this.logger) {
      return;
    }
    const payload: Record<string, unknown> = {
      analyzer: 'bedrock',
      service,
      category,
      outcome: 'failed',
      structuredOutputMode: this.nativeStructuredOutput ? 'native' : 'prompt',
    };
    if (this.requestId) {
      payload.requestId = this.requestId;
    }
    if (stopReason) {
      payload.stopReason = stopReason;
    }
    this.logger.info(payload, 'incident analysis failed');
  }
}
