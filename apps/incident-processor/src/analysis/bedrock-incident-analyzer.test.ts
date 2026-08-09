import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { describe, expect, it, vi } from 'vitest';

import {
  FakeIncidentAnalyzer,
  IncidentAnalysisError,
  type IncidentAnalysisInput,
} from '../../../../packages/analysis/src/index.js';

import {
  BEDROCK_INFERENCE_CONFIG,
  BedrockIncidentAnalyzer,
} from './bedrock-incident-analyzer.js';
import { buildIncidentAnalysisPrompt } from './build-incident-analysis-prompt.js';
import { createIncidentAnalyzer } from './create-incident-analyzer.js';
import { extractConverseText } from './extract-converse-text.js';
import { mapConverseTextToAnalysis } from './map-converse-text-to-analysis.js';

const baseInput: IncidentAnalysisInput = {
  service: 'payments-api',
  severity: 'high',
  errorType: 'TimeoutError',
  statusCode: 504,
  route: '/checkout',
  environment: 'dev',
  safeMessage: 'upstream timed out',
};

describe('buildIncidentAnalysisPrompt', () => {
  it('includes allow-listed fields and omits undefined optionals cleanly', () => {
    const prompt = buildIncidentAnalysisPrompt({
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

    const prompt = buildIncidentAnalysisPrompt(polluted);
    expect(prompt).toContain('Service: payments-api');
    expect(prompt).not.toContain('Bearer secret');
    expect(prompt).not.toContain('password');
    expect(prompt).not.toContain('at foo');
    expect(prompt).not.toContain('should-not-appear');
    expect(prompt).not.toContain('"raw"');
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

describe('mapConverseTextToAnalysis', () => {
  it('maps unstructured text conservatively without inventing root causes', () => {
    const analysis = mapConverseTextToAnalysis(
      'Likely a dependency timeout under load.',
    );
    expect(analysis.summary).toContain('dependency timeout');
    expect(analysis.possibleCause).toContain('SCRUM-39');
    expect(analysis.recommendedActions.length).toBeGreaterThanOrEqual(1);
  });
});

describe('BedrockIncidentAnalyzer', () => {
  it('sends ConverseCommand with configured model ID and safe prompt fields', async () => {
    const send = vi.fn().mockResolvedValue({
      output: {
        message: {
          role: 'assistant',
          content: [{ text: 'Concise technical summary from model.' }],
        },
      },
      usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60 },
    });
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

    const firstBlock = command.input.messages?.[0]?.content?.[0];
    const promptText =
      firstBlock && 'text' in firstBlock && typeof firstBlock.text === 'string'
        ? firstBlock.text
        : '';
    expect(promptText).toContain('Service: payments-api');
    expect(promptText).toContain('Error type: TimeoutError');
    expect(promptText).toContain('HTTP status: 504');
    expect(promptText).not.toContain('Authorization');
    expect(promptText).not.toContain('requestBody');

    expect(analysis.summary).toContain('Concise technical summary');
    expect(analysis.possibleCause).toContain('SCRUM-39');
    expect(analysis.recommendedActions.length).toBeGreaterThanOrEqual(1);

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        analyzer: 'bedrock',
        outcome: 'success',
        service: 'payments-api',
        requestId: 'req-123',
        inputTokens: 40,
        outputTokens: 20,
        totalTokens: 60,
      }),
      expect.any(String),
    );
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toContain('Concise technical summary from model');
    expect(logged).not.toContain('You are assisting an SRE');
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
    const send = vi.fn().mockResolvedValue({
      output: { message: { role: 'assistant', content: [] } },
    });
    const analyzer = new BedrockIncidentAnalyzer({
      client: { send },
      modelId: 'amazon.nova-lite-v1:0',
    });

    await expect(analyzer.analyze(baseInput)).rejects.toMatchObject({
      category: 'EMPTY_MODEL_RESPONSE',
    });
  });

  it('does not mutate input', async () => {
    const send = vi.fn().mockResolvedValue({
      output: {
        message: {
          role: 'assistant',
          content: [{ text: 'ok' }],
        },
      },
    });
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
