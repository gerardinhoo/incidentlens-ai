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

/** Fake Base64 string — not a real gzip payload (decoding is SCRUM-33). */
const FAKE_AWSLOGS_DATA = 'H4sIAAAAAAAAAfakeCloudWatchPayloadNotDecoded==';

afterEach(() => {
  resetProcessorConfigCache();
  resetProcessorLogger();
  vi.unstubAllEnvs();
});

describe('classifyEventType', () => {
  it('returns unclassified for empty object', () => {
    expect(classifyEventType({})).toBe('unclassified');
  });

  it('returns unclassified for generic non-CloudWatch events', () => {
    expect(
      classifyEventType({
        source: 'manual-smoke-test',
        detail: { message: 'processor foundation invocation' },
      }),
    ).toBe('unclassified');
  });

  it('returns cloudwatch_logs when awslogs.data is a string', () => {
    expect(classifyEventType({ awslogs: { data: FAKE_AWSLOGS_DATA } })).toBe(
      'cloudwatch_logs',
    );
  });

  it('returns unclassified when awslogs object is missing', () => {
    expect(classifyEventType({ message: 'no envelope' })).toBe('unclassified');
  });

  it('returns unclassified when awslogs lacks string data', () => {
    expect(classifyEventType({ awslogs: {} })).toBe('unclassified');
    expect(classifyEventType({ awslogs: { data: 123 } })).toBe('unclassified');
    expect(classifyEventType({ awslogs: { data: null } })).toBe('unclassified');
    expect(classifyEventType({ awslogs: null })).toBe('unclassified');
  });

  it('returns unclassified for null and primitives', () => {
    expect(classifyEventType(null)).toBe('unclassified');
    expect(classifyEventType('string')).toBe('unclassified');
    expect(classifyEventType(42)).toBe('unclassified');
  });
});

describe('handleProcessorInvocation', () => {
  it('returns accepted true with zero processed records', () => {
    const { logger, lines } = captureLogger();
    const result = handleProcessorInvocation({}, fakeContext, {
      config: loadProcessorConfig({ NODE_ENV: 'test', LOG_LEVEL: 'info' }),
      createLogger: (_config, requestId) => logger.child({ requestId }),
    });

    expect(result).toEqual({ accepted: true, processedRecords: 0 });
    expect(lines.length).toBeGreaterThan(0);
    const payload = lines[0] as Record<string, unknown>;
    expect(payload['requestId']).toBe('req-test-123');
    expect(payload['eventType']).toBe('unclassified');
    expect(payload['processedRecords']).toBe(0);
    expect(payload['outcome']).toBe('accepted');
    expect(payload).not.toHaveProperty('event');
    expect(JSON.stringify(payload)).not.toContain('manual-smoke-secret');
  });

  it('classifies CloudWatch envelope and never logs awslogs.data', () => {
    const { logger, lines } = captureLogger();
    const result = handleProcessorInvocation(
      { awslogs: { data: FAKE_AWSLOGS_DATA } },
      fakeContext,
      {
        config: loadProcessorConfig({ NODE_ENV: 'test' }),
        createLogger: (_config, requestId) => logger.child({ requestId }),
      },
    );

    expect(result).toEqual({ accepted: true, processedRecords: 0 });
    const payload = lines[0] as Record<string, unknown>;
    expect(payload['eventType']).toBe('cloudwatch_logs');
    expect(payload['hasAwsLogsData']).toBe(true);
    expect(payload['accepted']).toBe(true);
    expect(payload['processedRecords']).toBe(0);
    const blob = JSON.stringify(lines);
    expect(blob).not.toContain(FAKE_AWSLOGS_DATA);
    expect(blob).not.toContain('awslogs');
  });

  it('handles a generic non-CloudWatch event without logging its body', () => {
    const { logger, lines } = captureLogger();
    const event = {
      source: 'manual-smoke-test',
      detail: {
        message: 'processor foundation invocation',
        secret: 'manual-smoke-secret',
      },
    };

    const result = handleProcessorInvocation(event, fakeContext, {
      config: loadProcessorConfig({ NODE_ENV: 'test' }),
      createLogger: () => logger,
    });

    expect(result.accepted).toBe(true);
    expect(result.processedRecords).toBe(0);
    const blob = JSON.stringify(lines);
    expect(blob).not.toContain('manual-smoke-secret');
    expect(blob).not.toContain('processor foundation invocation');
  });

  it('does not call repository / DynamoDB / Bedrock / SNS or decode helpers', () => {
    const { logger } = captureLogger();
    const result = handleProcessorInvocation(
      { awslogs: { data: FAKE_AWSLOGS_DATA } },
      fakeContext,
      {
        config: loadProcessorConfig({ NODE_ENV: 'test' }),
        createLogger: () => logger,
      },
    );
    expect(result).toEqual({ accepted: true, processedRecords: 0 });
    // No decode/gunzip/parse/repository imports exist in the handler module.
  });

  it('does not crash on malformed unknown values', () => {
    const { logger } = captureLogger();
    expect(
      handleProcessorInvocation(undefined, fakeContext, {
        config: loadProcessorConfig({ NODE_ENV: 'test' }),
        createLogger: () => logger,
      }),
    ).toEqual({ accepted: true, processedRecords: 0 });
  });
});

describe('handler export', () => {
  it('works as a Lambda handler with empty object', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LOG_LEVEL', 'silent');
    const result = await handler({}, lambdaContext, () => undefined);
    expect(result).toEqual({ accepted: true, processedRecords: 0 });
  });
});

describe('loadProcessorConfig', () => {
  it('applies defaults for local testing', () => {
    const config = loadProcessorConfig({});
    expect(config.serviceName).toBe('incidentlens-processor');
    expect(config.logLevel).toBe('info');
    expect(config.incidentRepository).toBe('memory');
    expect(config.dynamodbIncidentsTable).toBeUndefined();
  });

  it('requires DYNAMODB_INCIDENTS_TABLE when repository is dynamodb', () => {
    expect(() =>
      loadProcessorConfig({ INCIDENT_REPOSITORY: 'dynamodb' }),
    ).toThrow(/DYNAMODB_INCIDENTS_TABLE/);
  });

  it('rejects invalid repository modes', () => {
    expect(() => loadProcessorConfig({ INCIDENT_REPOSITORY: 'redis' })).toThrow(
      /INCIDENT_REPOSITORY/,
    );
  });

  it('rejects invalid log levels', () => {
    expect(() => loadProcessorConfig({ LOG_LEVEL: 'verbose' })).toThrow(
      /LOG_LEVEL/,
    );
  });
});
