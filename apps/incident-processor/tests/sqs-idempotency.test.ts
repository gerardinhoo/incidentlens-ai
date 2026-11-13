/**
 * US-024 — SQS redelivery must not double-create, re-analyze, or re-notify.
 */
import { Writable } from 'node:stream';

import type { Context } from 'aws-lambda';
import pino, { type Logger } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';

import { FakeIncidentAnalyzer } from '../../../packages/analysis/src/index.js';
import { FakeIncidentNotifier } from '../../../packages/notifications/src/index.js';
import { MemoryIncidentRepository } from '../../../packages/repository/src/index.js';

import { resetProcessorAnalyzerCache } from '../src/analysis/create-processor-analyzer.js';
import {
  loadProcessorConfig,
  resetProcessorConfigCache,
} from '../src/config.js';
import { handleProcessorInvocation } from '../src/handler.js';
import { buildAutomaticIncidentId } from '../src/incidents/build-automatic-incident-id.js';
import { resetProcessorRepositoryCache } from '../src/incidents/create-processor-repository.js';
import { resetProcessorLogger } from '../src/logger.js';
import { resetProcessorNotifierCache } from '../src/notifications/create-processor-notifier.js';
import {
  sampleCandidate,
  sqsEventFromCandidates,
} from './helpers/sqs-fixtures.js';

function captureLogger(): { logger: Logger } {
  const stream = new Writable({
    write(_chunk: Buffer | string, _encoding, callback) {
      callback();
    },
  });
  const logger = pino(
    { level: 'silent', base: { service: 'sqs-idempotency' } },
    stream,
  );
  return { logger };
}

const fakeContext: Pick<Context, 'awsRequestId'> = {
  awsRequestId: 'sqs-idempotency-req',
};

afterEach(() => {
  resetProcessorConfigCache();
  resetProcessorLogger();
  resetProcessorRepositoryCache();
  resetProcessorAnalyzerCache();
  resetProcessorNotifierCache();
});

describe('SQS idempotency (US-024)', () => {
  it('two messages with the same sourceEventId create once and skip AI/SNS on the duplicate', async () => {
    const { logger } = captureLogger();
    const repository = new MemoryIncidentRepository();
    const analyzer = new FakeIncidentAnalyzer();
    const notifier = new FakeIncidentNotifier();
    const sourceEventId = 'sqs-redeliver-stable-id';
    const event = sqsEventFromCandidates([sampleCandidate({ sourceEventId })]);
    const deps = {
      config: loadProcessorConfig({
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        INCIDENT_NOTIFIER: 'fake',
      }),
      createLogger: () => logger,
      repository,
      analyzer,
      notifier,
    };

    const first = await handleProcessorInvocation(event, fakeContext, deps);
    const stored = await repository.findAll();
    const original = structuredClone(stored[0]!);

    expect(first.persistedIncidents).toBe(1);
    expect(first.duplicateIncidents).toBe(0);
    expect(first.analysisAttempts).toBe(1);
    expect(first.notificationAttempts).toBe(1);
    expect(first.notificationsSent).toBe(1);
    expect(first.batchItemFailures).toEqual([]);
    expect(analyzer.callCount).toBe(1);
    expect(notifier.callCount).toBe(1);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(buildAutomaticIncidentId(sourceEventId));

    const second = await handleProcessorInvocation(event, fakeContext, deps);
    expect(second.persistedIncidents).toBe(0);
    expect(second.duplicateIncidents).toBe(1);
    expect(second.analysisAttempts).toBe(0);
    expect(second.notificationAttempts).toBe(0);
    expect(second.batchItemFailures).toEqual([]);
    expect(analyzer.callCount).toBe(1);
    expect(notifier.callCount).toBe(1);
    expect(await repository.findAll()).toHaveLength(1);
    expect(await repository.findById(original.id)).toEqual(original);
  });

  it('same SQS batch with duplicate sourceEventId still analyzes and notifies once', async () => {
    const { logger } = captureLogger();
    const repository = new MemoryIncidentRepository();
    const analyzer = new FakeIncidentAnalyzer();
    const notifier = new FakeIncidentNotifier();
    const sourceEventId = 'sqs-batch-dup-id';
    const candidate = sampleCandidate({ sourceEventId });

    const result = await handleProcessorInvocation(
      sqsEventFromCandidates([candidate, candidate]),
      fakeContext,
      {
        config: loadProcessorConfig({
          NODE_ENV: 'test',
          LOG_LEVEL: 'silent',
          INCIDENT_NOTIFIER: 'fake',
        }),
        createLogger: () => logger,
        repository,
        analyzer,
        notifier,
      },
    );

    expect(result.persistedIncidents).toBe(1);
    expect(result.duplicateIncidents).toBe(1);
    expect(result.failedRecords).toBe(0);
    expect(result.batchItemFailures).toEqual([]);
    expect(analyzer.callCount).toBe(1);
    expect(notifier.callCount).toBe(1);
    expect(await repository.findAll()).toHaveLength(1);
  });
});
