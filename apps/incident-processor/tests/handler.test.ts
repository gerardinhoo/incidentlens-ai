import { Writable } from 'node:stream';

import type { Context } from 'aws-lambda';
import pino, { type Logger } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Incident } from '../../../packages/domain/src/index.js';
import type {
  IncidentRepository,
  SaveIfAbsentResult,
} from '../../../packages/repository/src/index.js';
import { MemoryIncidentRepository } from '../../../packages/repository/src/index.js';

import {
  loadProcessorConfig,
  resetProcessorConfigCache,
} from '../src/config.js';
import {
  classifyEventType,
  handleProcessorInvocation,
  handler,
} from '../src/handler.js';
import { buildAutomaticIncidentId } from '../src/incidents/build-automatic-incident-id.js';
import { resetProcessorRepositoryCache } from '../src/incidents/create-processor-repository.js';
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

const zeroPersistence = {
  attemptedIncidents: 0,
  persistedIncidents: 0,
  duplicateIncidents: 0,
  persistenceFailures: 0,
  analysisAttempts: 0,
  analyzedIncidents: 0,
  analysisFailures: 0,
  analysisPersistenceFailures: 0,
} as const;

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

class OnceFailingRepository implements IncidentRepository {
  private calls = 0;
  readonly memory = new MemoryIncidentRepository();

  save(incident: Incident): Promise<Incident> {
    return this.memory.save(incident);
  }

  async saveIfAbsent(incident: Incident): Promise<SaveIfAbsentResult> {
    this.calls += 1;
    if (this.calls === 1) {
      throw new Error('simulated');
    }
    return this.memory.saveIfAbsent(incident);
  }

  findById(id: string): Promise<Incident | undefined> {
    return this.memory.findById(id);
  }

  findAll(): Promise<Incident[]> {
    return this.memory.findAll();
  }
}

afterEach(() => {
  resetProcessorConfigCache();
  resetProcessorLogger();
  resetProcessorRepositoryCache();
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

describe('handleProcessorInvocation persistence', () => {
  it('persists one candidate (persistedIncidents = 1) into MemoryIncidentRepository', async () => {
    const { logger, lines } = captureLogger();
    const repository = new MemoryIncidentRepository();
    const envelope = encodeCloudWatchEnvelope(
      baseDataPayload([
        { id: '1', timestamp: 1, message: candidatePinoMessage() },
      ]),
    );

    const result = await handleProcessorInvocation(envelope, fakeContext, {
      config: loadProcessorConfig({ NODE_ENV: 'test' }),
      createLogger: () => logger,
      repository,
    });

    expect(result).toEqual({
      accepted: true,
      messageType: 'DATA_MESSAGE',
      receivedRecords: 1,
      processedRecords: 1,
      ignoredRecords: 0,
      failedRecords: 0,
      attemptedIncidents: 1,
      persistedIncidents: 1,
      duplicateIncidents: 0,
      persistenceFailures: 0,
      analysisAttempts: 1,
      analyzedIncidents: 1,
      analysisFailures: 0,
      analysisPersistenceFailures: 0,
    });

    const stored = await repository.findAll();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(buildAutomaticIncidentId('1'));
    expect(stored[0]?.status).toBe('open');
    expect(stored[0]?.source).toBe('incidentlens-demo-api');
    expect(stored[0]?.severity).toBe('high');
    expect(stored[0]?.analysis?.status).toBe('completed');

    const persistedLog = lines.find(
      (line) =>
        typeof line === 'object' &&
        line !== null &&
        (line as Record<string, unknown>)['msg'] ===
          'automatic incident persisted',
    ) as Record<string, unknown> | undefined;
    expect(persistedLog?.['outcome']).toBe('persisted');
    expect(persistedLog?.['incidentId']).toBe(stored[0]?.id);
  });

  it('invoking the same envelope twice yields one incident and a duplicate', async () => {
    const { logger, lines } = captureLogger();
    const repository = new MemoryIncidentRepository();
    const envelope = encodeCloudWatchEnvelope(
      baseDataPayload([
        {
          id: 'stable-event-id',
          timestamp: 1,
          message: candidatePinoMessage(),
        },
      ]),
    );
    const deps = {
      config: loadProcessorConfig({ NODE_ENV: 'test' }),
      createLogger: () => logger,
      repository,
    };

    const first = await handleProcessorInvocation(envelope, fakeContext, deps);
    const original = (await repository.findAll())[0]!;
    const second = await handleProcessorInvocation(envelope, fakeContext, deps);

    expect(first.persistedIncidents).toBe(1);
    expect(first.duplicateIncidents).toBe(0);
    expect(second.persistedIncidents).toBe(0);
    expect(second.duplicateIncidents).toBe(1);
    expect(second.persistenceFailures).toBe(0);
    expect(second.failedRecords).toBe(0);
    expect(await repository.findAll()).toHaveLength(1);
    expect((await repository.findById(original.id))?.title).toBe(
      original.title,
    );
    expect((await repository.findById(original.id))?.status).toBe('open');

    const summary = lines.find(
      (line) =>
        typeof line === 'object' &&
        line !== null &&
        (line as Record<string, unknown>)['msg'] ===
          'cloudwatch data message processed' &&
        (line as Record<string, unknown>)['duplicateIncidents'] === 1,
    ) as Record<string, unknown> | undefined;
    expect(summary?.['outcome']).toBe('completed');

    const dupLog = lines.find(
      (line) =>
        typeof line === 'object' &&
        line !== null &&
        (line as Record<string, unknown>)['msg'] ===
          'duplicate automatic incident ignored',
    ) as Record<string, unknown> | undefined;
    expect(dupLog?.['outcome']).toBe('duplicate');
  });

  it('candidate plus info log persists only one incident', async () => {
    const { logger } = captureLogger();
    const repository = new MemoryIncidentRepository();
    const result = await handleProcessorInvocation(
      encodeCloudWatchEnvelope(
        baseDataPayload([
          { id: '1', timestamp: 1, message: candidatePinoMessage() },
          { id: '2', timestamp: 2, message: infoPinoMessage() },
        ]),
      ),
      fakeContext,
      {
        config: loadProcessorConfig({ NODE_ENV: 'test' }),
        createLogger: () => logger,
        repository,
      },
    );
    expect(result.processedRecords).toBe(1);
    expect(result.ignoredRecords).toBe(1);
    expect(result.persistedIncidents).toBe(1);
    expect(result.duplicateIncidents).toBe(0);
    expect((await repository.findAll()).length).toBe(1);
  });

  it('candidate plus malformed embedded log still persists valid candidate', async () => {
    const { logger } = captureLogger();
    const repository = new MemoryIncidentRepository();
    const result = await handleProcessorInvocation(
      encodeCloudWatchEnvelope(
        baseDataPayload([
          { id: '1', timestamp: 1, message: candidatePinoMessage() },
          { id: '2', timestamp: 2, message: '{broken' },
        ]),
      ),
      fakeContext,
      {
        config: loadProcessorConfig({ NODE_ENV: 'test' }),
        createLogger: () => logger,
        repository,
      },
    );
    expect(result.failedRecords).toBe(1);
    expect(result.persistedIncidents).toBe(1);
    expect((await repository.findAll()).length).toBe(1);
  });

  it('two candidates persist two incidents', async () => {
    const { logger } = captureLogger();
    const repository = new MemoryIncidentRepository();
    const result = await handleProcessorInvocation(
      encodeCloudWatchEnvelope(
        baseDataPayload([
          { id: '1', timestamp: 1, message: candidatePinoMessage() },
          { id: '2', timestamp: 2, message: candidatePinoMessage() },
        ]),
      ),
      fakeContext,
      {
        config: loadProcessorConfig({ NODE_ENV: 'test' }),
        createLogger: () => logger,
        repository,
      },
    );
    expect(result.processedRecords).toBe(2);
    expect(result.persistedIncidents).toBe(2);
    expect((await repository.findAll()).length).toBe(2);
  });

  it('one save failure plus one success returns partial-failure summary', async () => {
    const { logger, lines } = captureLogger();
    const repository = new OnceFailingRepository();
    const result = await handleProcessorInvocation(
      encodeCloudWatchEnvelope(
        baseDataPayload([
          { id: '1', timestamp: 1, message: candidatePinoMessage() },
          { id: '2', timestamp: 2, message: candidatePinoMessage() },
        ]),
      ),
      fakeContext,
      {
        config: loadProcessorConfig({ NODE_ENV: 'test' }),
        createLogger: () => logger,
        repository,
      },
    );

    expect(result.accepted).toBe(true);
    expect(result.attemptedIncidents).toBe(2);
    expect(result.persistedIncidents).toBe(1);
    expect(result.duplicateIncidents).toBe(0);
    expect(result.persistenceFailures).toBe(1);
    expect((await repository.findAll()).length).toBe(1);

    const summary = lines.find(
      (line) =>
        typeof line === 'object' &&
        line !== null &&
        (line as Record<string, unknown>)['msg'] ===
          'cloudwatch data message processed',
    ) as Record<string, unknown> | undefined;
    expect(summary?.['outcome']).toBe('partially_failed');
  });

  it('CONTROL_MESSAGE writes nothing', async () => {
    const { logger } = captureLogger();
    const repository = new MemoryIncidentRepository();
    const result = await handleProcessorInvocation(
      encodeCloudWatchEnvelope(controlPayload()),
      fakeContext,
      {
        config: loadProcessorConfig({ NODE_ENV: 'test' }),
        createLogger: () => logger,
        repository,
      },
    );
    expect(result).toEqual({
      accepted: true,
      messageType: 'CONTROL_MESSAGE',
      receivedRecords: 0,
      processedRecords: 0,
      ignoredRecords: 0,
      failedRecords: 0,
      ...zeroPersistence,
    });
    expect(await repository.findAll()).toEqual([]);
  });

  it('unclassified manual event writes nothing', async () => {
    const { logger } = captureLogger();
    const repository = new MemoryIncidentRepository();
    const result = await handleProcessorInvocation({}, fakeContext, {
      config: loadProcessorConfig({ NODE_ENV: 'test' }),
      createLogger: (_c, requestId) => logger.child({ requestId }),
      repository,
    });
    expect(result).toEqual({
      accepted: true,
      messageType: 'unclassified',
      receivedRecords: 0,
      processedRecords: 0,
      ignoredRecords: 0,
      failedRecords: 0,
      ...zeroPersistence,
    });
    expect(await repository.findAll()).toEqual([]);
  });

  it('corrupt outer event rejects and writes nothing', async () => {
    const { logger } = captureLogger();
    const repository = new MemoryIncidentRepository();
    await expect(
      handleProcessorInvocation(
        { awslogs: { data: '!!!bad!!!' } },
        fakeContext,
        {
          config: loadProcessorConfig({ NODE_ENV: 'test', LOG_LEVEL: 'error' }),
          createLogger: () => logger,
          repository,
        },
      ),
    ).rejects.toMatchObject({ category: 'invalid_base64' });
    expect(await repository.findAll()).toEqual([]);
  });
});

describe('handler export integration', () => {
  it('processes a mixed CloudWatch batch end-to-end with memory repository', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LOG_LEVEL', 'silent');
    vi.stubEnv('INCIDENT_REPOSITORY', 'memory');

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
      attemptedIncidents: 1,
      persistedIncidents: 1,
      duplicateIncidents: 0,
      persistenceFailures: 0,
      analysisAttempts: 1,
      analyzedIncidents: 1,
      analysisFailures: 0,
      analysisPersistenceFailures: 0,
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
      ...zeroPersistence,
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

  it('accepts dynamodb mode with table name', () => {
    const config = loadProcessorConfig({
      INCIDENT_REPOSITORY: 'dynamodb',
      DYNAMODB_INCIDENTS_TABLE: 'incidentlens-dev-incidents',
    });
    expect(config.incidentRepository).toBe('dynamodb');
    expect(config.dynamodbIncidentsTable).toBe('incidentlens-dev-incidents');
  });
});
