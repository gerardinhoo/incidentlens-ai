/**
 * Local pipeline integration tests (SCRUM-36).
 *
 * No AWS credentials. Uses the real processor handler with MemoryIncidentRepository
 * and generated CloudWatch envelopes.
 *
 * Deployed AWS verification lives in scripts/verify-incident-pipeline.sh and
 * only runs after main apply (or manually).
 */
import { Writable } from 'node:stream';

import type { Context } from 'aws-lambda';
import pino, { type Logger } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';

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
import { handleProcessorInvocation } from '../src/handler.js';
import { buildAutomaticIncidentId } from '../src/incidents/build-automatic-incident-id.js';
import { resetProcessorRepositoryCache } from '../src/incidents/create-processor-repository.js';
import { resetProcessorLogger } from '../src/logger.js';
import {
  baseDataPayload,
  candidatePinoMessage,
  controlPayload,
  encodeCloudWatchEnvelope,
  infoPinoMessage,
} from './helpers/cloudwatch-fixtures.js';

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
    { level: 'info', base: { service: 'pipeline-test' } },
    stream,
  );
  return { logger, lines };
}

const fakeContext: Pick<Context, 'awsRequestId'> = {
  awsRequestId: 'pipeline-integration-req',
};

/**
 * Fails saveIfAbsent once for a specific incident id, then delegates to memory.
 */
class SelectiveFailRepository implements IncidentRepository {
  private failedOnce = false;
  readonly memory = new MemoryIncidentRepository();

  constructor(private readonly failForId: string) {}

  save(incident: Incident): Promise<Incident> {
    return this.memory.save(incident);
  }

  async saveIfAbsent(incident: Incident): Promise<SaveIfAbsentResult> {
    if (!this.failedOnce && incident.id === this.failForId) {
      this.failedOnce = true;
      throw new Error('simulated repository failure');
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
});

describe('local pipeline integration (no AWS)', () => {
  it('mixed DATA_MESSAGE: candidate + info + malformed → one incident, then replay duplicates', async () => {
    const { logger } = captureLogger();
    const repository = new MemoryIncidentRepository();
    const eventId = 'pipeline-mixed-event-1';
    const envelope = encodeCloudWatchEnvelope(
      baseDataPayload([
        { id: eventId, timestamp: 1, message: candidatePinoMessage() },
        { id: 'info-1', timestamp: 2, message: infoPinoMessage() },
        { id: 'bad-1', timestamp: 3, message: '{not-json' },
      ]),
    );
    const deps = {
      config: loadProcessorConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
      createLogger: () => logger,
      repository,
    };

    const first = await handleProcessorInvocation(envelope, fakeContext, deps);

    expect(first.accepted).toBe(true);
    expect(first.messageType).toBe('DATA_MESSAGE');
    expect(first.receivedRecords).toBe(3);
    expect(first.processedRecords).toBe(1);
    expect(first.ignoredRecords).toBe(1);
    expect(first.failedRecords).toBe(1);
    expect(first.attemptedIncidents).toBe(1);
    expect(first.persistedIncidents).toBe(1);
    expect(first.duplicateIncidents).toBe(0);
    expect(first.persistenceFailures).toBe(0);

    const stored = await repository.findAll();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(buildAutomaticIncidentId(eventId));
    expect(stored[0]?.status).toBe('open');
    expect(stored[0]?.source).toBe('incidentlens-demo-api');
    expect(stored[0]?.severity).toBe('high');
    expect(stored[0]?.errorType).toBe('Error');
    expect(stored[0]?.title).toBe('Error detected in incidentlens-demo-api');
    expect(stored[0]?.metadata['sourceEventId']).toBe(eventId);

    const originalSnapshot = structuredClone(stored[0]!);

    const second = await handleProcessorInvocation(envelope, fakeContext, deps);
    expect(second.accepted).toBe(true);
    expect(second.persistedIncidents).toBe(0);
    expect(second.duplicateIncidents).toBe(1);
    expect(second.persistenceFailures).toBe(0);
    expect(await repository.findAll()).toHaveLength(1);
    expect(await repository.findById(originalSnapshot.id)).toEqual(
      originalSnapshot,
    );
  });

  it('partial-failure batch: mapping fail, repo fail, duplicate, then new success', async () => {
    const { logger } = captureLogger();
    // Order is intentional: processor is sequential.
    const failEventId = 'pipeline-repo-fail';
    const repository = new SelectiveFailRepository(
      buildAutomaticIncidentId(failEventId),
    );

    // Seed a prior incident so "dup-event" is a duplicate when replayed in-batch.
    await repository.memory.saveIfAbsent({
      id: buildAutomaticIncidentId('dup-event'),
      title: 'Error detected in incidentlens-demo-api',
      source: 'incidentlens-demo-api',
      severity: 'high',
      status: 'open',
      errorType: 'Error',
      metadata: { sourceEventId: 'dup-event' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const envelope = encodeCloudWatchEnvelope(
      baseDataPayload([
        {
          id: 'valid-first',
          timestamp: 1,
          message: candidatePinoMessage({ service: 'incidentlens-demo-api' }),
        },
        {
          id: 'bad-severity',
          timestamp: 2,
          // Unknown severity → parsed candidate without severity → mapping failure.
          message: candidatePinoMessage({ severity: 'not-a-severity' }),
        },
        {
          id: failEventId,
          timestamp: 3,
          message: candidatePinoMessage(),
        },
        {
          id: 'dup-event',
          timestamp: 4,
          message: candidatePinoMessage(),
        },
        {
          id: 'valid-after',
          timestamp: 5,
          message: candidatePinoMessage({ service: 'incidentlens-demo-api' }),
        },
      ]),
    );

    const result = await handleProcessorInvocation(envelope, fakeContext, {
      config: loadProcessorConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
      createLogger: () => logger,
      repository,
    });

    expect(result.accepted).toBe(true);
    expect(result.receivedRecords).toBe(5);
    expect(result.processedRecords).toBe(5);
    expect(result.attemptedIncidents).toBe(5);
    expect(result.persistedIncidents).toBe(2); // valid-first + valid-after
    expect(result.duplicateIncidents).toBe(1); // dup-event
    expect(result.persistenceFailures).toBe(1); // failEventId once
    // mappingFailures is in summary logs; equation via attempted:
    // 2 persisted + 1 duplicate + 1 mapping + 1 persistence = 5
    expect(
      result.persistedIncidents +
        result.duplicateIncidents +
        result.persistenceFailures,
    ).toBe(4);
    // One mapping failure accounts for the remaining attempted count.
    expect(result.attemptedIncidents).toBe(
      result.persistedIncidents +
        result.duplicateIncidents +
        result.persistenceFailures +
        1,
    );

    const all = await repository.findAll();
    // Seeded dup + valid-first + valid-after (fail never stored)
    expect(all.map((i) => i.metadata['sourceEventId']).sort()).toEqual(
      ['dup-event', 'valid-after', 'valid-first'].sort(),
    );
    expect(all.every((i) => i.status === 'open')).toBe(true);
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
    expect(result.messageType).toBe('CONTROL_MESSAGE');
    expect(result.persistedIncidents).toBe(0);
    expect(result.duplicateIncidents).toBe(0);
    expect(await repository.findAll()).toEqual([]);
  });

  it('corrupt outer payload fails the invocation and writes nothing', async () => {
    const { logger } = captureLogger();
    const repository = new MemoryIncidentRepository();
    await expect(
      handleProcessorInvocation(
        { awslogs: { data: '!!!not-base64!!!' } },
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
