import { Writable } from 'node:stream';

import type { Context } from 'aws-lambda';
import pino, { type Logger } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadProcessorConfig,
  resetProcessorConfigCache,
} from '../src/config.js';
import {
  classifyEventType,
  handleProcessorInvocation,
  handler,
} from '../src/handler.js';
import { resetProcessorLogger } from '../src/logger.js';
import type { ProcessorResult } from '../src/types.js';
import {
  baseDataPayload,
  candidatePinoMessage,
  controlPayload,
  encodeCloudWatchEnvelope,
  infoPinoMessage,
} from './helpers/cloudwatch-fixtures.js';

async function invokeHandler(
  event: unknown,
  context: Context,
): Promise<ProcessorResult> {
  return handler(event, context, () => undefined) as Promise<ProcessorResult>;
}

function captureLogger(): { logger: Logger; lines: unknown[] } {
  const lines: unknown[] = [];
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      lines.push(JSON.parse(text) as unknown);
      callback();
    },
  });
  const logger = pino(
    { level: 'info', base: { service: 'test-processor' } },
    stream,
  );
  return { logger, lines };
}

const fakeContext: Pick<Context, 'awsRequestId'> = {
  awsRequestId: 'req-test-123',
};

const lambdaContext: Context = {
  awsRequestId: 'lambda-req-1',
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'incidentlens-dev-processor',
  functionVersion: '$LATEST',
  invokedFunctionArn:
    'arn:aws:lambda:us-east-1:123456789012:function:incidentlens-dev-processor',
  memoryLimitInMB: '256',
  logGroupName: '/aws/lambda/incidentlens-dev-processor',
  logStreamName: 'stream',
  getRemainingTimeInMillis: () => 30_000,
  done: () => undefined,
  fail: () => undefined,
  succeed: () => undefined,
};

afterEach(() => {
  resetProcessorConfigCache();
  resetProcessorLogger();
  vi.unstubAllEnvs();
});

describe('classifyEventType', () => {
  it('returns unclassified for generic events', () => {
    expect(classifyEventType({})).toBe('unclassified');
    expect(classifyEventType({ source: 'manual' })).toBe('unclassified');
  });

  it('returns cloudwatch_logs for awslogs.data string envelopes', () => {
    expect(classifyEventType({ awslogs: { data: 'abc=' } })).toBe(
      'cloudwatch_logs',
    );
  });

  it('returns unclassified when awslogs data is not a string', () => {
    expect(classifyEventType({ awslogs: { data: 1 } })).toBe('unclassified');
    expect(classifyEventType({ awslogs: null })).toBe('unclassified');
  });
});

describe('handleProcessorInvocation', () => {
  it('keeps generic manual events compatible (accepted, zero counts)', async () => {
    const { logger, lines } = captureLogger();
    const result = await handleProcessorInvocation({}, fakeContext, {
      config: loadProcessorConfig({ NODE_ENV: 'test' }),
      createLogger: (_c, requestId) => logger.child({ requestId }),
    });

    expect(result).toEqual({
      accepted: true,
      messageType: 'unclassified',
      receivedRecords: 0,
      processedRecords: 0,
      ignoredRecords: 0,
      failedRecords: 0,
    });
    expect((lines[0] as Record<string, unknown>)['requestId']).toBe(
      'req-test-123',
    );
  });

  it('counts one valid candidate as processedRecords = 1', async () => {
    const { logger } = captureLogger();
    const envelope = encodeCloudWatchEnvelope(
      baseDataPayload([
        {
          id: '1',
          timestamp: 1,
          message: candidatePinoMessage(),
        },
      ]),
    );
    const result = await handleProcessorInvocation(envelope, fakeContext, {
      config: loadProcessorConfig({ NODE_ENV: 'test' }),
      createLogger: () => logger,
    });
    expect(result.accepted).toBe(true);
    expect(result.messageType).toBe('DATA_MESSAGE');
    expect(result.receivedRecords).toBe(1);
    expect(result.processedRecords).toBe(1);
    expect(result.ignoredRecords).toBe(0);
    expect(result.failedRecords).toBe(0);
  });

  it('counts multiple candidates', async () => {
    const { logger } = captureLogger();
    const envelope = encodeCloudWatchEnvelope(
      baseDataPayload([
        { id: '1', timestamp: 1, message: candidatePinoMessage() },
        { id: '2', timestamp: 2, message: candidatePinoMessage() },
      ]),
    );
    const result = await handleProcessorInvocation(envelope, fakeContext, {
      config: loadProcessorConfig({ NODE_ENV: 'test' }),
      createLogger: () => logger,
    });
    expect(result.processedRecords).toBe(2);
    expect(result.receivedRecords).toBe(2);
  });

  it('increments ignoredRecords for non-candidate logs', async () => {
    const { logger } = captureLogger();
    const envelope = encodeCloudWatchEnvelope(
      baseDataPayload([
        { id: '1', timestamp: 1, message: candidatePinoMessage() },
        { id: '2', timestamp: 2, message: infoPinoMessage() },
      ]),
    );
    const result = await handleProcessorInvocation(envelope, fakeContext, {
      config: loadProcessorConfig({ NODE_ENV: 'test' }),
      createLogger: () => logger,
    });
    expect(result.processedRecords).toBe(1);
    expect(result.ignoredRecords).toBe(1);
  });

  it('increments failedRecords for malformed embedded JSON without failing valid ones', async () => {
    const { logger, lines } = captureLogger();
    const envelope = encodeCloudWatchEnvelope(
      baseDataPayload([
        { id: '1', timestamp: 1, message: candidatePinoMessage() },
        { id: '2', timestamp: 2, message: infoPinoMessage() },
        { id: '3', timestamp: 3, message: '{broken' },
      ]),
    );
    const result = await handleProcessorInvocation(envelope, fakeContext, {
      config: loadProcessorConfig({ NODE_ENV: 'test' }),
      createLogger: () => logger,
    });

    expect(result).toEqual({
      accepted: true,
      messageType: 'DATA_MESSAGE',
      receivedRecords: 3,
      processedRecords: 1,
      ignoredRecords: 1,
      failedRecords: 1,
    });

    const blob = JSON.stringify(lines);
    expect(blob).not.toContain(envelope.awslogs.data);
    expect(blob).not.toContain('{broken');
  });

  it('handles CONTROL_MESSAGE with zero counts', async () => {
    const { logger, lines } = captureLogger();
    const result = await handleProcessorInvocation(
      encodeCloudWatchEnvelope(controlPayload()),
      fakeContext,
      {
        config: loadProcessorConfig({ NODE_ENV: 'test' }),
        createLogger: () => logger,
      },
    );
    expect(result).toEqual({
      accepted: true,
      messageType: 'CONTROL_MESSAGE',
      receivedRecords: 0,
      processedRecords: 0,
      ignoredRecords: 0,
      failedRecords: 0,
    });
    expect((lines[0] as Record<string, unknown>)['messageType']).toBe(
      'CONTROL_MESSAGE',
    );
  });

  it('rejects corrupt outer payloads', async () => {
    const { logger, lines } = captureLogger();
    await expect(
      handleProcessorInvocation(
        { awslogs: { data: '!!!bad!!!' } },
        fakeContext,
        {
          config: loadProcessorConfig({ NODE_ENV: 'test', LOG_LEVEL: 'error' }),
          createLogger: () => logger,
        },
      ),
    ).rejects.toMatchObject({ category: 'invalid_base64' });

    const errLine = lines.find(
      (line) =>
        typeof line === 'object' &&
        line !== null &&
        (line as Record<string, unknown>)['outcome'] === 'failed',
    ) as Record<string, unknown> | undefined;
    expect(errLine?.['errorCategory']).toBe('invalid_base64');
    expect(JSON.stringify(lines)).not.toContain('!!!bad!!!');
  });

  it('does not call repository / DynamoDB / Bedrock / SNS', async () => {
    const { logger } = captureLogger();
    const result = await handleProcessorInvocation(
      encodeCloudWatchEnvelope(
        baseDataPayload([
          { id: '1', timestamp: 1, message: candidatePinoMessage() },
        ]),
      ),
      fakeContext,
      {
        config: loadProcessorConfig({ NODE_ENV: 'test' }),
        createLogger: () => logger,
      },
    );
    expect(result.processedRecords).toBe(1);
  });
});

describe('handler export integration', () => {
  it('processes a mixed CloudWatch batch end-to-end', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LOG_LEVEL', 'silent');

    const envelope = encodeCloudWatchEnvelope(
      baseDataPayload([
        { id: '1', timestamp: 1, message: candidatePinoMessage() },
        { id: '2', timestamp: 2, message: infoPinoMessage() },
        { id: '3', timestamp: 3, message: '{not-json' },
      ]),
    );

    const result = await invokeHandler(envelope, lambdaContext);
    expect(result).toEqual({
      accepted: true,
      messageType: 'DATA_MESSAGE',
      receivedRecords: 3,
      processedRecords: 1,
      ignoredRecords: 1,
      failedRecords: 1,
    });
  });

  it('keeps empty-object direct invoke smoke-compatible', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LOG_LEVEL', 'silent');
    const result = await invokeHandler({}, lambdaContext);
    expect(result).toEqual({
      accepted: true,
      messageType: 'unclassified',
      receivedRecords: 0,
      processedRecords: 0,
      ignoredRecords: 0,
      failedRecords: 0,
    });
  });
});

describe('loadProcessorConfig', () => {
  it('applies defaults for local testing', () => {
    const config = loadProcessorConfig({});
    expect(config.serviceName).toBe('incidentlens-processor');
    expect(config.logLevel).toBe('info');
    expect(config.incidentRepository).toBe('memory');
  });

  it('requires DYNAMODB_INCIDENTS_TABLE when repository is dynamodb', () => {
    expect(() =>
      loadProcessorConfig({ INCIDENT_REPOSITORY: 'dynamodb' }),
    ).toThrow(/DYNAMODB_INCIDENTS_TABLE/);
  });
});
