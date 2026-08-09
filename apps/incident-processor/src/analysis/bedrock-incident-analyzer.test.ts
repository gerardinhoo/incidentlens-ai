import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { describe, expect, it, vi } from 'vitest';

import {
  FakeIncidentAnalyzer,
  INCIDENT_ANALYSIS_SCHEMA_NAME,
  IncidentAnalysisError,
  getIncidentAnalysisJsonSchemaString,
  type IncidentAnalysisInput,
} from '../../../../packages/analysis/src/index.js';

import {
  BEDROCK_INFERENCE_CONFIG,
  BedrockIncidentAnalyzer,
} from './bedrock-incident-analyzer.js';
import {
  INCIDENT_ANALYSIS_SYSTEM_PROMPT,
  buildIncidentAnalysisUserContent,
} from './build-incident-analysis-prompt.js';
import { createIncidentAnalyzer } from './create-incident-analyzer.js';
import { extractConverseText } from './extract-converse-text.js';

const baseInput: IncidentAnalysisInput = {
  service: 'payments-api',
  severity: 'high',
  errorType: 'TimeoutError',
  statusCode: 504,
  route: '/checkout',
  environment: 'dev',
  safeMessage: 'upstream timed out',
};

const validAnalysis = {
  summary: 'The payments-api returned HTTP 504 on /checkout.',
  possibleCause:
    'A possible cause is an upstream dependency timeout under load.',
  recommendedActions: [
    'Inspect recent application logs for the failing route.',
    'Check dependency health and latency metrics.',
    'Review recent deployments for the payments-api service.',
  ],
};

function mockConverseResponse(
  overrides: {
    text?: string;
    stopReason?: string;
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
    content?: unknown[];
  } = {},
) {
  const content =
    overrides.content ??
    (overrides.text !== undefined
      ? [{ text: overrides.text }]
      : [{ text: JSON.stringify(validAnalysis) }]);

  return {
    stopReason: overrides.stopReason ?? 'end_turn',
    output: {
      message: {
        role: 'assistant' as const,
        content,
      },
    },
    usage: overrides.usage ?? {
      inputTokens: 40,
      outputTokens: 20,
      totalTokens: 60,
    },
  };
}

describe('buildIncidentAnalysisUserContent', () => {
  it('includes allow-listed fields and omits undefined optionals cleanly', () => {
    const prompt = buildIncidentAnalysisUserContent({
      service: 'api',
      severity: 'medium',
      errorType: 'Error',
    });

    expect(prompt).toContain('Service: api');
    expect(prompt).toContain('Severity: medium');
    expect(prompt).toContain('Error type: Error');
    expect(prompt).not.toContain('HTTP status:');
    expect(prompt).not.toContain('Route:');
    expect(prompt).not.toContain('undefined');
    expect(prompt).not.toContain('Authorization');
    expect(prompt).not.toContain('cookie');
    expect(prompt).not.toContain('stack');
    expect(prompt).not.toContain('CloudWatch');
  });

  it('never serializes arbitrary metadata or sensitive fields', () => {
    const polluted = {
      ...baseInput,
      authorization: 'Bearer secret',
      requestBody: '{"password":"x"}',
      stack: 'Error\n at foo',
      metadata: { raw: true },
      awsRequestId: 'should-not-appear',
    } as IncidentAnalysisInput & Record<string, unknown>;

    const prompt = buildIncidentAnalysisUserContent(polluted);
    expect(prompt).toContain('Service: payments-api');
    expect(prompt).not.toContain('Bearer secret');
    expect(prompt).not.toContain('password');
    expect(prompt).not.toContain('at foo');
    expect(prompt).not.toContain('should-not-appear');
    expect(prompt).not.toContain('"raw"');
  });
});

describe('INCIDENT_ANALYSIS_SYSTEM_PROMPT', () => {
  it('encodes semantic safety rules and forbids chain-of-thought', () => {
    const prompt = INCIDENT_ANALYSIS_SYSTEM_PROMPT.toLowerCase();
    expect(prompt).toContain('do not claim a root cause is proven');
    expect(prompt).toContain('do not invent evidence');
    expect(prompt).toContain('investigation steps');
    expect(prompt).toContain('destructive');
    expect(prompt).toContain(
      'do not provide hidden reasoning or chain-of-thought',
    );
  });
});

describe('extractConverseText', () => {
  it('concatenates multiple text blocks', () => {
    const text = extractConverseText({
      output: {
        message: {
          role: 'assistant',
          content: [{ text: 'First.' }, { text: 'Second.' }],
        },
      },
    });
    expect(text).toBe('First.\nSecond.');
  });

  it('fails safely on missing output', () => {
    expect(() => extractConverseText({})).toThrow(IncidentAnalysisError);
    expect(() => extractConverseText({})).toThrow(/no message content/);
  });

  it('fails safely on empty content / no text blocks', () => {
    expect(() =>
      extractConverseText({
        output: { message: { role: 'assistant', content: [] } },
      }),
    ).toThrow(/no message content/);

    expect(() =>
      extractConverseText({
        output: {
          message: {
            role: 'assistant',
            content: [{ text: '   ' }, { text: '' }],
          },
        },
      }),
    ).toThrow(/no text content/);
  });
});

describe('BedrockIncidentAnalyzer', () => {
  it('sends ConverseCommand with prompt schema and safe fields (Nova Lite default)', async () => {
    const send = vi.fn().mockResolvedValue(mockConverseResponse());
    const info = vi.fn();
    const analyzer = new BedrockIncidentAnalyzer({
      client: { send },
      modelId: 'amazon.nova-lite-v1:0',
      logger: { info },
      requestId: 'req-123',
    });

    const analysis = await analyzer.analyze(baseInput);

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as ConverseCommand;
    expect(command).toBeInstanceOf(ConverseCommand);
    expect(command.input.modelId).toBe('amazon.nova-lite-v1:0');
    expect(command.input.inferenceConfig?.maxTokens).toBe(
      BEDROCK_INFERENCE_CONFIG.maxTokens,
    );
    expect(command.input.inferenceConfig?.temperature).toBe(
      BEDROCK_INFERENCE_CONFIG.temperature,
    );
    // Nova Lite rejects outputConfig — default path must not send it.
    expect(command.input.outputConfig).toBeUndefined();

    const systemText = command.input.system?.[0];
    const system =
      systemText && 'text' in systemText ? (systemText.text ?? '') : '';
    expect(system).toContain('SRE incident-analysis assistant');
    expect(system).toContain(getIncidentAnalysisJsonSchemaString());

    const firstBlock = command.input.messages?.[0]?.content?.[0];
    const userText =
      firstBlock && 'text' in firstBlock && typeof firstBlock.text === 'string'
        ? firstBlock.text
        : '';
    expect(userText).toContain('Service: payments-api');
    expect(userText).toContain('Error type: TimeoutError');
    expect(userText).toContain('HTTP status: 504');
    expect(userText).not.toContain('Authorization');
    expect(userText).not.toContain('requestBody');

    expect(analysis).toEqual(validAnalysis);

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        analyzer: 'bedrock',
        outcome: 'success',
        service: 'payments-api',
        requestId: 'req-123',
        stopReason: 'end_turn',
        structuredOutputMode: 'prompt',
        inputTokens: 40,
        outputTokens: 20,
        totalTokens: 60,
      }),
      expect.any(String),
    );
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toContain(validAnalysis.summary);
    expect(logged).not.toContain('Operational facts');
    expect(logged).not.toContain(validAnalysis.recommendedActions[0]);
  });

  it('optionally supplies native Converse outputConfig when enabled', async () => {
    const send = vi.fn().mockResolvedValue(mockConverseResponse());
    const analyzer = new BedrockIncidentAnalyzer({
      client: { send },
      modelId: 'amazon.nova-lite-v1:0',
      nativeStructuredOutput: true,
    });

    await analyzer.analyze(baseInput);
    const command = send.mock.calls[0]?.[0] as ConverseCommand;
    expect(command.input.outputConfig?.textFormat?.type).toBe('json_schema');
    expect(
      command.input.outputConfig?.textFormat?.structure?.jsonSchema?.name,
    ).toBe(INCIDENT_ANALYSIS_SCHEMA_NAME);
    expect(
      command.input.outputConfig?.textFormat?.structure?.jsonSchema?.schema,
    ).toBe(getIncidentAnalysisJsonSchemaString());
  });

  it('rejects unexpected stop reasons', async () => {
    const send = vi
      .fn()
      .mockResolvedValue(
        mockConverseResponse({ stopReason: 'content_filtered' }),
      );
    const analyzer = new BedrockIncidentAnalyzer({
      client: { send },
      modelId: 'amazon.nova-lite-v1:0',
    });
    await expect(analyzer.analyze(baseInput)).rejects.toMatchObject({
      category: 'INVALID_MODEL_RESPONSE',
    });
  });

  it('fails on max_tokens as truncated output', async () => {
    const send = vi.fn().mockResolvedValue(
      mockConverseResponse({
        stopReason: 'max_tokens',
        text: JSON.stringify(validAnalysis),
      }),
    );
    const info = vi.fn();
    const analyzer = new BedrockIncidentAnalyzer({
      client: { send },
      modelId: 'amazon.nova-lite-v1:0',
      logger: { info },
    });

    await expect(analyzer.analyze(baseInput)).rejects.toMatchObject({
      category: 'MODEL_OUTPUT_TRUNCATED',
    });
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failed',
        category: 'MODEL_OUTPUT_TRUNCATED',
        stopReason: 'max_tokens',
      }),
      expect.any(String),
    );
  });

  it('rejects malformed JSON and invalid schema objects', async () => {
    const malformed = new BedrockIncidentAnalyzer({
      client: {
        send: vi
          .fn()
          .mockResolvedValue(mockConverseResponse({ text: '{not-json' })),
      },
      modelId: 'amazon.nova-lite-v1:0',
    });
    await expect(malformed.analyze(baseInput)).rejects.toMatchObject({
      category: 'INVALID_MODEL_RESPONSE',
    });

    const invalidSchema = new BedrockIncidentAnalyzer({
      client: {
        send: vi.fn().mockResolvedValue(
          mockConverseResponse({
            text: JSON.stringify({ summary: 'only summary' }),
          }),
        ),
      },
      modelId: 'amazon.nova-lite-v1:0',
    });
    await expect(invalidSchema.analyze(baseInput)).rejects.toMatchObject({
      category: 'INVALID_MODEL_RESPONSE',
    });
  });

  it('wraps provider exceptions as safe IncidentAnalysisError', async () => {
    const send = vi.fn().mockRejectedValue(new Error('AccessDeniedException'));
    const info = vi.fn();
    const analyzer = new BedrockIncidentAnalyzer({
      client: { send },
      modelId: 'amazon.nova-lite-v1:0',
      logger: { info },
    });

    await expect(analyzer.analyze(baseInput)).rejects.toMatchObject({
      name: 'IncidentAnalysisError',
      category: 'BEDROCK_INVOCATION_FAILED',
    });
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        analyzer: 'bedrock',
        outcome: 'failed',
        category: 'BEDROCK_INVOCATION_FAILED',
      }),
      expect.any(String),
    );
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toContain('AccessDeniedException');
  });

  it('rejects empty model responses safely', async () => {
    const send = vi
      .fn()
      .mockResolvedValue(mockConverseResponse({ content: [] }));
    const analyzer = new BedrockIncidentAnalyzer({
      client: { send },
      modelId: 'amazon.nova-lite-v1:0',
    });

    await expect(analyzer.analyze(baseInput)).rejects.toMatchObject({
      category: 'EMPTY_MODEL_RESPONSE',
    });
  });

  it('does not mutate input', async () => {
    const send = vi.fn().mockResolvedValue(mockConverseResponse());
    const analyzer = new BedrockIncidentAnalyzer({
      client: { send },
      modelId: 'amazon.nova-lite-v1:0',
    });
    const frozen = Object.freeze({ ...baseInput });
    await analyzer.analyze(frozen);
    expect(frozen.service).toBe('payments-api');
  });
});

describe('createIncidentAnalyzer', () => {
  it('selects FakeIncidentAnalyzer for fake', async () => {
    const analyzer = createIncidentAnalyzer({ provider: 'fake' });
    expect(analyzer).toBeInstanceOf(FakeIncidentAnalyzer);
    const result = await analyzer.analyze(baseInput);
    expect(result.summary).toContain('payments-api');
    expect(result.possibleCause).toMatch(/possible cause/i);
  });

  it('selects BedrockIncidentAnalyzer for bedrock', () => {
    const analyzer = createIncidentAnalyzer({
      provider: 'bedrock',
      modelId: 'amazon.nova-lite-v1:0',
      client: { send: vi.fn() },
    });
    expect(analyzer).toBeInstanceOf(BedrockIncidentAnalyzer);
  });

  it('requires BEDROCK_MODEL_ID for bedrock and does not fall back', () => {
    expect(() =>
      createIncidentAnalyzer({
        provider: 'bedrock',
        modelId: '   ',
        client: { send: vi.fn() },
      }),
    ).toThrow(/BEDROCK_MODEL_ID is required/);
  });

  it('fails clearly for invalid provider', () => {
    expect(() =>
      createIncidentAnalyzer({ provider: 'openai' } as never),
    ).toThrow(/Invalid INCIDENT_ANALYZER/);
  });

  it('fake does not require model ID and needs no credentials', async () => {
    const previous = process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_ACCESS_KEY_ID;
    try {
      const analyzer = createIncidentAnalyzer({ provider: 'fake' });
      await expect(analyzer.analyze(baseInput)).resolves.toBeDefined();
    } finally {
      if (previous !== undefined) {
        process.env.AWS_ACCESS_KEY_ID = previous;
      }
    }
  });
});
