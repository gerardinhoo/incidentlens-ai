/**
 * Sprint 5 local AI pipeline integration (SCRUM-42).
 *
 * Real processor handler + MemoryIncidentRepository + FakeIncidentAnalyzer +
 * FakeIncidentNotifier. No AWS credentials.
 */
import { Writable } from 'node:stream';

import type { Context } from 'aws-lambda';
import pino, { type Logger } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';

import {
  FakeIncidentAnalyzer,
  createFailingFakeIncidentAnalyzer,
} from '../../../packages/analysis/src/index.js';
import {
  FakeIncidentNotifier,
  createFailingFakeIncidentNotifier,
} from '../../../packages/notifications/src/index.js';
import type { IncidentRepository } from '../../../packages/repository/src/index.js';
import { MemoryIncidentRepository } from '../../../packages/repository/src/index.js';

import { resetProcessorAnalyzerCache } from '../src/analysis/create-processor-analyzer.js';
import {
  loadProcessorConfig,
  resetProcessorConfigCache,
} from '../src/config.js';
import { batchOutcome, handleProcessorInvocation } from '../src/handler.js';
import { buildAutomaticIncidentId } from '../src/incidents/build-automatic-incident-id.js';
import { resetProcessorRepositoryCache } from '../src/incidents/create-processor-repository.js';
import { resetProcessorLogger } from '../src/logger.js';
import { resetProcessorNotifierCache } from '../src/notifications/create-processor-notifier.js';
import type { ProcessorResult } from '../src/types.js';
import {
  baseDataPayload,
  candidatePinoMessage,
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
    { level: 'info', base: { service: 'sprint5-pipeline' } },
    stream,
  );
  return { logger, lines };
}

const fakeContext: Pick<Context, 'awsRequestId'> = {
  awsRequestId: 'sprint5-ai-pipeline-req',
};

function baseDeps(overrides: {
  repository?: IncidentRepository;
  analyzer?: FakeIncidentAnalyzer;
  notifier?: FakeIncidentNotifier;
  logger?: Logger;
}) {
  return {
    config: loadProcessorConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      INCIDENT_NOTIFIER: 'fake',
      INCIDENT_ANALYZER: 'fake',
    }),
    createLogger: () => overrides.logger ?? captureLogger().logger,
    repository: overrides.repository ?? new MemoryIncidentRepository(),
    analyzer: overrides.analyzer ?? new FakeIncidentAnalyzer(),
    notifier: overrides.notifier ?? new FakeIncidentNotifier(),
  };
}

/** Attempted-incident work reconciles across persistence outcomes. */
function assertAttemptedIncidentInvariant(
  result: ProcessorResult,
  mappingFailures: number,
): void {
  expect(
    result.persistedIncidents +
      result.duplicateIncidents +
      mappingFailures +
      result.persistenceFailures,
  ).toBe(result.attemptedIncidents);
}

afterEach(() => {
  resetProcessorConfigCache();
  resetProcessorLogger();
  resetProcessorRepositoryCache();
  resetProcessorAnalyzerCache();
  resetProcessorNotifierCache();
});

describe('Sprint 5 AI pipeline (local, no AWS)', () => {
  it('full happy path: decode → persist → analyze → notify once', async () => {
    const { logger } = captureLogger();
    const repository = new MemoryIncidentRepository();
    const analyzer = new FakeIncidentAnalyzer();
    const notifier = new FakeIncidentNotifier();
    const eventId = 'sprint5-happy-1';
    const envelope = encodeCloudWatchEnvelope(
      baseDataPayload([
        { id: eventId, timestamp: 1, message: candidatePinoMessage() },
      ]),
    );

    const result = await handleProcessorInvocation(
      envelope,
      fakeContext,
      baseDeps({ repository, analyzer, notifier, logger }),
    );

    expect(result).toMatchObject({
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
      notificationAttempts: 1,
      notificationsSent: 1,
      notificationFailures: 0,
      notificationsSkipped: 0,
    });
    assertAttemptedIncidentInvariant(result, 0);
    expect(batchOutcome(result)).toBe('completed');

    const stored = (await repository.findAll())[0]!;
    expect(stored.id).toBe(buildAutomaticIncidentId(eventId));
    expect(stored.status).toBe('open');
    expect(stored.severity).toBe('high');
    expect(stored.analysis?.status).toBe('completed');
    expect(stored.analysis?.summary).toBeTruthy();
    expect(stored.analysis?.possibleCause).toBeTruthy();
    expect(stored.analysis?.recommendedActions?.length).toBeGreaterThanOrEqual(
      1,
    );
    expect(stored.analysis?.analyzedAt).toBeTruthy();

    expect(analyzer.callCount).toBe(1);
    expect(notifier.callCount).toBe(1);
    expect(notifier.lastInput).toMatchObject({
      incidentId: stored.id,
      source: 'incidentlens-demo-api',
      severity: 'high',
      status: 'open',
    });
    expect(notifier.lastInput?.analysis?.summary).toBeTruthy();
    expect(notifier.lastInput?.analysis?.possibleCause).toBeTruthy();
    expect(
      notifier.lastInput?.analysis?.recommendedActions?.length,
    ).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(notifier.lastInput)).not.toContain('Authorization');
    expect(JSON.stringify(notifier.lastInput)).not.toContain('stack');
  });

  it('duplicate replay: analyzer and notifier stay at one call', async () => {
    const repository = new MemoryIncidentRepository();
    const analyzer = new FakeIncidentAnalyzer();
    const notifier = new FakeIncidentNotifier();
    const envelope = encodeCloudWatchEnvelope(
      baseDataPayload([
        {
          id: 'sprint5-dup-fixed',
          timestamp: 1,
          message: candidatePinoMessage(),
        },
      ]),
    );
    const deps = baseDeps({ repository, analyzer, notifier });

    const first = await handleProcessorInvocation(envelope, fakeContext, deps);
    const original = structuredClone((await repository.findAll())[0]!);

    const second = await handleProcessorInvocation(envelope, fakeContext, deps);

    expect(first.persistedIncidents).toBe(1);
    expect(first.analysisAttempts).toBe(1);
    expect(first.analyzedIncidents).toBe(1);
    expect(first.notificationAttempts).toBe(1);
    expect(first.notificationsSent).toBe(1);

    expect(second.persistedIncidents).toBe(0);
    expect(second.duplicateIncidents).toBe(1);
    expect(second.analysisAttempts).toBe(0);
    expect(second.analyzedIncidents).toBe(0);
    expect(second.notificationAttempts).toBe(0);
    expect(second.notificationsSent).toBe(0);
    expect(second.notificationsSkipped).toBe(0);

    expect(analyzer.callCount).toBe(1);
    expect(notifier.callCount).toBe(1);
    expect(await repository.findAll()).toHaveLength(1);
    expect(await repository.findById(original.id)).toEqual(original);
  });

  it('Bedrock failure isolation: incident open, analysis failed, factual notify', async () => {
    const repository = new MemoryIncidentRepository();
    const analyzer = createFailingFakeIncidentAnalyzer(
      'BEDROCK_INVOCATION_FAILED',
    );
    const notifier = new FakeIncidentNotifier();
    const result = await handleProcessorInvocation(
      encodeCloudWatchEnvelope(
        baseDataPayload([
          {
            id: 'sprint5-bedrock-fail',
            timestamp: 1,
            message: candidatePinoMessage(),
          },
        ]),
      ),
      fakeContext,
      baseDeps({ repository, analyzer, notifier }),
    );

    expect(result.persistedIncidents).toBe(1);
    expect(result.analysisAttempts).toBe(1);
    expect(result.analyzedIncidents).toBe(0);
    expect(result.analysisFailures).toBe(1);
    expect(result.notificationAttempts).toBe(1);
    expect(result.notificationsSent).toBe(1);
    expect(batchOutcome(result)).toBe('partially_completed');

    const stored = (await repository.findAll())[0]!;
    expect(stored.status).toBe('open');
    expect(stored.analysis?.status).toBe('failed');
    expect(stored.analysis?.summary).toBeUndefined();
    expect(stored.analysis?.possibleCause).toBeUndefined();
    expect(stored.analysis?.recommendedActions).toBeUndefined();

    expect(notifier.callCount).toBe(1);
    expect(notifier.lastInput?.analysis).toBeUndefined();
    expect(notifier.lastInput?.severity).toBe('high');
    expect(notifier.lastInput?.status).toBe('open');
  });

  it('SNS failure isolation: incident + analysis retained, batch continues', async () => {
    const repository = new MemoryIncidentRepository();
    const analyzer = new FakeIncidentAnalyzer();
    const notifier = createFailingFakeIncidentNotifier('SNS_PUBLISH_FAILED');

    const envelope = encodeCloudWatchEnvelope(
      baseDataPayload([
        {
          id: 'sprint5-sns-fail',
          timestamp: 1,
          message: candidatePinoMessage(),
        },
        {
          id: 'sprint5-sns-later',
          timestamp: 2,
          message: candidatePinoMessage({ severity: 'warn' }),
        },
      ]),
    );

    // Use a notifier that fails only the first call.
    let calls = 0;
    const selectiveNotifier = {
      callCount: 0,
      lastInput: undefined as
        Parameters<FakeIncidentNotifier['notify']>[0] | undefined,
      notify(input: Parameters<FakeIncidentNotifier['notify']>[0]) {
        this.callCount += 1;
        this.lastInput = input;
        calls += 1;
        if (calls === 1) {
          return notifier.notify(input);
        }
        return Promise.resolve();
      },
    };

    const result = await handleProcessorInvocation(envelope, fakeContext, {
      ...baseDeps({ repository, analyzer }),
      notifier: selectiveNotifier,
    });

    expect(result.persistedIncidents).toBe(2);
    expect(result.analyzedIncidents).toBe(2);
    expect(result.notificationAttempts).toBe(1); // high only
    expect(result.notificationFailures).toBe(1);
    expect(result.notificationsSent).toBe(0);
    expect(result.notificationsSkipped).toBe(1); // medium
    expect(batchOutcome(result)).toBe('partially_completed');

    const all = await repository.findAll();
    expect(all).toHaveLength(2);
    expect(all.every((i) => i.status === 'open')).toBe(true);
    expect(all.every((i) => i.analysis?.status === 'completed')).toBe(true);
  });

  it('mixed batch: counters stay coherent across outcomes', async () => {
    const { logger } = captureLogger();
    const repository = new MemoryIncidentRepository();

    // Seed duplicate target.
    await repository.saveIfAbsent({
      id: buildAutomaticIncidentId('sprint5-mixed-dup'),
      title: 'seed',
      source: 'incidentlens-demo-api',
      severity: 'high',
      status: 'open',
      errorType: 'Error',
      metadata: { sourceEventId: 'sprint5-mixed-dup' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    let analyzeCalls = 0;
    const analyzer = {
      callCount: 0,
      analyze(input: Parameters<FakeIncidentAnalyzer['analyze']>[0]) {
        this.callCount += 1;
        analyzeCalls += 1;
        if (analyzeCalls === 1) {
          return createFailingFakeIncidentAnalyzer(
            'EMPTY_MODEL_RESPONSE',
          ).analyze(input);
        }
        return new FakeIncidentAnalyzer().analyze(input);
      },
    };

    let notifyCalls = 0;
    const notifier = {
      callCount: 0,
      inputs: [] as Array<Parameters<FakeIncidentNotifier['notify']>[0]>,
      notify(input: Parameters<FakeIncidentNotifier['notify']>[0]) {
        this.callCount += 1;
        this.inputs.push(input);
        notifyCalls += 1;
        // Order of eligible notifies: high-ok (1), notify-fail (2), later (3).
        if (notifyCalls === 2) {
          return createFailingFakeIncidentNotifier().notify(input);
        }
        return Promise.resolve();
      },
    };

    const envelope = encodeCloudWatchEnvelope(
      baseDataPayload([
        {
          id: 'sprint5-mixed-high-ok',
          timestamp: 1,
          message: candidatePinoMessage(), // high → analyzer fail first
        },
        {
          id: 'sprint5-mixed-medium',
          timestamp: 2,
          message: candidatePinoMessage({ severity: 'warn' }),
        },
        {
          id: 'sprint5-mixed-dup',
          timestamp: 3,
          message: candidatePinoMessage(),
        },
        {
          id: 'malformed-1',
          timestamp: 4,
          message: '{not-json',
        },
        {
          id: 'sprint5-mixed-map-fail',
          timestamp: 5,
          message: candidatePinoMessage({ severity: 'not-a-severity' }),
        },
        {
          id: 'sprint5-mixed-notify-fail',
          timestamp: 6,
          message: candidatePinoMessage({ severity: 'critical' }),
        },
        {
          id: 'sprint5-mixed-later',
          timestamp: 7,
          message: candidatePinoMessage(),
        },
        {
          id: 'info-skip',
          timestamp: 8,
          message: infoPinoMessage(),
        },
      ]),
    );

    const result = await handleProcessorInvocation(envelope, fakeContext, {
      ...baseDeps({ repository }),
      createLogger: () => logger,
      analyzer,
      notifier,
    });

    // Candidates parsed: high-ok, medium, dup, map-fail, notify-fail, later = 6
    // + malformed failedRecords=1, ignored info=1
    expect(result.receivedRecords).toBe(8);
    expect(result.failedRecords).toBe(1);
    expect(result.ignoredRecords).toBe(1);
    expect(result.processedRecords).toBe(6);

    expect(result.attemptedIncidents).toBe(6);
    expect(result.persistedIncidents).toBe(4); // high-ok, medium, notify-fail, later
    expect(result.duplicateIncidents).toBe(1);
    // mappingFailures logged separately; reconcile via invariant with 1 mapping fail
    assertAttemptedIncidentInvariant(result, 1);
    expect(result.persistenceFailures).toBe(0);

    expect(result.analysisAttempts).toBe(4);
    expect(result.analysisFailures).toBe(1); // high-ok first
    expect(result.analyzedIncidents).toBe(3); // medium, notify-fail, later

    // Eligible notifies: high-ok (failed AI, still notify), notify-fail, later
    // medium skipped; dup skipped
    expect(result.notificationAttempts).toBe(3);
    expect(result.notificationFailures).toBe(1);
    expect(result.notificationsSent).toBe(2);
    expect(result.notificationsSkipped).toBe(1); // medium

    expect(batchOutcome(result)).toBe('partially_completed');
    expect(await repository.findAll()).toHaveLength(5); // seed dup + 4 new
  });

  it('documents counter invariant helpers', () => {
    expect(
      batchOutcome({
        attemptedIncidents: 1,
        persistenceFailures: 0,
        analysisFailures: 0,
        analysisPersistenceFailures: 0,
        notificationFailures: 1,
      }),
    ).toBe('partially_completed');
  });
});
