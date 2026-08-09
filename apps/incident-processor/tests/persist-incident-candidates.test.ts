import pino from 'pino';
import { describe, expect, it } from 'vitest';

import {
  FakeIncidentAnalyzer,
  IncidentAnalysisError,
  createFailingFakeIncidentAnalyzer,
  type IncidentAnalysis,
  type IncidentAnalyzer,
} from '../../../packages/analysis/src/index.js';
import type { Incident } from '../../../packages/domain/src/index.js';
import {
  FakeIncidentNotifier,
  createFailingFakeIncidentNotifier,
  type IncidentNotifier,
} from '../../../packages/notifications/src/index.js';
import type {
  IncidentRepository,
  SaveIfAbsentResult,
} from '../../../packages/repository/src/index.js';
import { MemoryIncidentRepository } from '../../../packages/repository/src/index.js';

import type { ParsedIncidentCandidate } from '../src/cloudwatch/types.js';
import { buildAutomaticIncidentId } from '../src/incidents/build-automatic-incident-id.js';
import { persistIncidentCandidates } from '../src/incidents/persist-incident-candidates.js';

function candidate(
  overrides: Partial<ParsedIncidentCandidate> = {},
): ParsedIncidentCandidate {
  return {
    sourceEventId: 'evt-1',
    timestamp: 1,
    logGroup: '/aws/lambda/api',
    logStream: 'stream',
    eventType: 'incident_candidate',
    service: 'incidentlens-demo-api',
    severity: 'error',
    errorType: 'Error',
    statusCode: 500,
    route: '/test-error',
    environment: 'test',
    msg: 'controlled test failure',
    ...overrides,
  };
}

class FailingThenSucceedingRepository implements IncidentRepository {
  private calls = 0;
  readonly created = new Map<string, Incident>();

  save(incident: Incident): Promise<Incident> {
    this.created.set(incident.id, incident);
    return Promise.resolve(incident);
  }

  saveIfAbsent(incident: Incident): Promise<SaveIfAbsentResult> {
    this.calls += 1;
    if (this.calls === 1) {
      return Promise.reject(new Error('simulated save failure'));
    }
    if (this.created.has(incident.id)) {
      return Promise.resolve('duplicate');
    }
    this.created.set(incident.id, incident);
    return Promise.resolve('created');
  }

  findById(id: string): Promise<Incident | undefined> {
    return Promise.resolve(this.created.get(id));
  }

  findAll(): Promise<Incident[]> {
    return Promise.resolve([...this.created.values()]);
  }
}

/**
 * Succeeds saveIfAbsent, fails later save() once (analysis persistence failure).
 */
class CreateOkSaveFailsRepository implements IncidentRepository {
  private saveCalls = 0;
  readonly memory = new MemoryIncidentRepository();

  save(incident: Incident): Promise<Incident> {
    this.saveCalls += 1;
    if (this.saveCalls === 1) {
      return Promise.reject(new Error('simulated analysis save failure'));
    }
    return this.memory.save(incident);
  }

  saveIfAbsent(incident: Incident): Promise<SaveIfAbsentResult> {
    return this.memory.saveIfAbsent(incident);
  }

  findById(id: string): Promise<Incident | undefined> {
    return this.memory.findById(id);
  }

  findAll(): Promise<Incident[]> {
    return this.memory.findAll();
  }
}

class CapturingAnalyzer implements IncidentAnalyzer {
  lastInput: unknown;
  callCount = 0;

  constructor(
    private readonly inner: IncidentAnalyzer = new FakeIncidentAnalyzer(),
  ) {}

  analyze(
    input: Parameters<IncidentAnalyzer['analyze']>[0],
  ): Promise<IncidentAnalysis> {
    this.callCount += 1;
    this.lastInput = input;
    return this.inner.analyze(input);
  }
}

describe('persistIncidentCandidates', () => {
  const log = pino({ level: 'silent' });

  function run(
    candidates: ParsedIncidentCandidate[],
    overrides: {
      repository?: IncidentRepository;
      analyzer?: IncidentAnalyzer;
      notifier?: IncidentNotifier;
      notifierName?: string;
    } = {},
  ) {
    return persistIncidentCandidates(candidates, {
      repository: overrides.repository ?? new MemoryIncidentRepository(),
      analyzer: overrides.analyzer ?? new FakeIncidentAnalyzer(),
      notifier: overrides.notifier ?? new FakeIncidentNotifier(),
      log,
      analyzerName: 'fake',
      notifierName: overrides.notifierName ?? 'fake',
    });
  }

  it('creates, analyzes, and persists completed analysis for a new candidate', async () => {
    const repository = new MemoryIncidentRepository();
    const analyzer = new CapturingAnalyzer();
    const notifier = new FakeIncidentNotifier();
    const summary = await run([candidate()], {
      repository,
      analyzer,
      notifier,
    });

    expect(summary).toMatchObject({
      attemptedIncidents: 1,
      persistedIncidents: 1,
      duplicateIncidents: 0,
      mappingFailures: 0,
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

    const stored = (await repository.findAll())[0]!;
    expect(stored.id).toBe(buildAutomaticIncidentId('evt-1'));
    expect(stored.status).toBe('open');
    expect(stored.analysis?.status).toBe('completed');
    expect(stored.analysis?.summary).toContain('incidentlens-demo-api');
    expect(stored.analysis?.possibleCause).toMatch(/possible cause/i);
    expect(stored.analysis?.recommendedActions?.length).toBeGreaterThanOrEqual(
      1,
    );
    expect(stored.analysis?.analyzedAt).toBeTruthy();

    expect(analyzer.callCount).toBe(1);
    expect(analyzer.lastInput).toMatchObject({
      service: 'incidentlens-demo-api',
      severity: 'high',
      errorType: 'Error',
      statusCode: 500,
      route: '/test-error',
      environment: 'test',
      safeMessage: 'controlled test failure',
    });
    expect(JSON.stringify(analyzer.lastInput)).not.toContain('Authorization');
    expect(JSON.stringify(analyzer.lastInput)).not.toContain('stack');

    expect(notifier.callCount).toBe(1);
    expect(notifier.lastInput).toMatchObject({
      incidentId: stored.id,
      severity: 'high',
      source: 'incidentlens-demo-api',
      status: 'open',
    });
    expect(notifier.lastInput?.analysis?.summary).toBeTruthy();
    expect(notifier.lastInput?.analysis?.possibleCause).toBeTruthy();
    expect(
      notifier.lastInput?.analysis?.recommendedActions?.length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('notifies critical severity once with completed analysis', async () => {
    const notifier = new FakeIncidentNotifier();
    const summary = await run([candidate({ severity: 'critical' })], {
      notifier,
    });
    expect(summary.notificationsSent).toBe(1);
    expect(notifier.callCount).toBe(1);
    expect(notifier.lastInput?.severity).toBe('critical');
  });

  it('skips notification for medium and low severity', async () => {
    const notifier = new FakeIncidentNotifier();
    const medium = await run([candidate({ severity: 'warn' })], { notifier });
    expect(medium.persistedIncidents).toBe(1);
    expect(medium.notificationsSkipped).toBe(1);
    expect(medium.notificationAttempts).toBe(0);
    expect(notifier.callCount).toBe(0);

    const lowNotifier = new FakeIncidentNotifier();
    const low = await run(
      [candidate({ sourceEventId: 'low-1', severity: 'info' })],
      { notifier: lowNotifier },
    );
    expect(low.notificationsSkipped).toBe(1);
    expect(lowNotifier.callCount).toBe(0);
  });

  it('does not call analyzer or notifier again for duplicates', async () => {
    const repository = new MemoryIncidentRepository();
    const analyzer = new FakeIncidentAnalyzer();
    const notifier = new FakeIncidentNotifier();
    const first = await run([candidate()], { repository, analyzer, notifier });
    const original = (await repository.findAll())[0]!;
    const analyzeAfterFirst = analyzer.callCount;
    const notifyAfterFirst = notifier.callCount;

    const second = await run([candidate({ service: 'should-not-overwrite' })], {
      repository,
      analyzer,
      notifier,
    });

    expect(first.analyzedIncidents).toBe(1);
    expect(first.notificationsSent).toBe(1);
    expect(second.persistedIncidents).toBe(0);
    expect(second.duplicateIncidents).toBe(1);
    expect(second.analysisAttempts).toBe(0);
    expect(second.notificationAttempts).toBe(0);
    expect(second.notificationsSkipped).toBe(0);
    expect(analyzer.callCount).toBe(analyzeAfterFirst);
    expect(notifier.callCount).toBe(notifyAfterFirst);
    expect((await repository.findById(original.id))?.analysis?.status).toBe(
      'completed',
    );
    expect((await repository.findById(original.id))?.source).toBe(
      'incidentlens-demo-api',
    );
  });

  it('keeps the incident when analyzer fails and still notifies high severity', async () => {
    const repository = new MemoryIncidentRepository();
    const analyzer = createFailingFakeIncidentAnalyzer(
      'BEDROCK_INVOCATION_FAILED',
    );
    const notifier = new FakeIncidentNotifier();
    const summary = await run([candidate()], {
      repository,
      analyzer,
      notifier,
    });

    expect(summary.persistedIncidents).toBe(1);
    expect(summary.analysisAttempts).toBe(1);
    expect(summary.analyzedIncidents).toBe(0);
    expect(summary.analysisFailures).toBe(1);
    expect(summary.analysisPersistenceFailures).toBe(0);
    expect(summary.notificationAttempts).toBe(1);
    expect(summary.notificationsSent).toBe(1);

    const stored = (await repository.findAll())[0]!;
    expect(stored.status).toBe('open');
    expect(stored.analysis?.status).toBe('failed');
    expect(stored.analysis?.summary).toBeUndefined();
    expect(stored.analysis?.possibleCause).toBeUndefined();
    expect(stored.analysis?.recommendedActions).toBeUndefined();
    expect(stored.analysis?.analyzedAt).toBeTruthy();

    expect(notifier.lastInput?.analysis).toBeUndefined();
    expect(notifier.lastInput?.severity).toBe('high');
  });

  it('keeps incident and analysis when notifier fails', async () => {
    const repository = new MemoryIncidentRepository();
    const notifier = createFailingFakeIncidentNotifier('SNS_PUBLISH_FAILED');
    const summary = await run([candidate()], { repository, notifier });

    expect(summary.persistedIncidents).toBe(1);
    expect(summary.analyzedIncidents).toBe(1);
    expect(summary.notificationAttempts).toBe(1);
    expect(summary.notificationsSent).toBe(0);
    expect(summary.notificationFailures).toBe(1);
    expect(summary.duplicateIncidents).toBe(0);

    const stored = (await repository.findAll())[0]!;
    expect(stored.status).toBe('open');
    expect(stored.analysis?.status).toBe('completed');
  });

  it('counts analysisPersistenceFailures when enrichment save fails', async () => {
    const repository = new CreateOkSaveFailsRepository();
    const analyzer = new FakeIncidentAnalyzer();
    const notifier = new FakeIncidentNotifier();
    const summary = await run([candidate()], {
      repository,
      analyzer,
      notifier,
    });

    expect(summary.persistedIncidents).toBe(1);
    expect(summary.analysisAttempts).toBe(1);
    expect(summary.analyzedIncidents).toBe(0);
    expect(summary.analysisFailures).toBe(0);
    expect(summary.analysisPersistenceFailures).toBe(1);
    expect(summary.duplicateIncidents).toBe(0);
    // In-memory completed analysis still drives notification.
    expect(summary.notificationsSent).toBe(1);
    const stored = (await repository.findAll())[0]!;
    expect(stored.analysis?.status).toBe('pending');
  });

  it('continues after a repository failure that is not a duplicate', async () => {
    const repository = new FailingThenSucceedingRepository();
    const analyzer = new FakeIncidentAnalyzer();
    const notifier = new FakeIncidentNotifier();
    const summary = await run(
      [
        candidate({ sourceEventId: 'fail' }),
        candidate({ sourceEventId: 'ok' }),
      ],
      { repository, analyzer, notifier },
    );
    expect(summary.attemptedIncidents).toBe(2);
    expect(summary.persistedIncidents).toBe(1);
    expect(summary.persistenceFailures).toBe(1);
    expect(summary.analysisAttempts).toBe(1);
    expect(summary.analyzedIncidents).toBe(1);
    expect(summary.notificationsSent).toBe(1);
    expect(repository.created.size).toBe(1);
  });

  it('continues after mapping failure without counting as persistenceFailures', async () => {
    const repository = new MemoryIncidentRepository();
    const analyzer = new FakeIncidentAnalyzer();
    const notifier = new FakeIncidentNotifier();
    const bad = candidate({ sourceEventId: 'bad' });
    delete bad.severity;
    const summary = await run([bad, candidate({ sourceEventId: 'good' })], {
      repository,
      analyzer,
      notifier,
    });
    expect(summary.mappingFailures).toBe(1);
    expect(summary.persistedIncidents).toBe(1);
    expect(summary.analyzedIncidents).toBe(1);
    expect(summary.notificationsSent).toBe(1);
    expect(
      summary.persistedIncidents +
        summary.duplicateIncidents +
        summary.mappingFailures +
        summary.persistenceFailures,
    ).toBe(summary.attemptedIncidents);
  });

  it('handles mixed success, analyzer failure, duplicate, mapping, create failure, and notify', async () => {
    const repository = new FailingThenSucceedingRepository();
    let analyzeCalls = 0;
    const selective: IncidentAnalyzer = {
      analyze(input) {
        analyzeCalls += 1;
        if (analyzeCalls === 1) {
          return Promise.reject(
            new IncidentAnalysisError(
              'EMPTY_MODEL_RESPONSE',
              'Bedrock returned no text content',
            ),
          );
        }
        return new FakeIncidentAnalyzer().analyze(input);
      },
    };
    const notifier = new FakeIncidentNotifier();

    const bad = candidate({ sourceEventId: 'map-bad' });
    delete bad.severity;

    const summary = await run(
      [
        candidate({ sourceEventId: 'create-fail' }),
        bad,
        candidate({ sourceEventId: 'analyze-fail' }),
        candidate({ sourceEventId: 'analyze-fail' }),
        candidate({ sourceEventId: 'success' }),
        candidate({ sourceEventId: 'medium-skip', severity: 'warn' }),
      ],
      { repository, analyzer: selective, notifier },
    );

    expect(summary.attemptedIncidents).toBe(6);
    expect(summary.persistenceFailures).toBe(1);
    expect(summary.mappingFailures).toBe(1);
    expect(summary.persistedIncidents).toBe(3);
    expect(summary.duplicateIncidents).toBe(1);
    expect(summary.analysisAttempts).toBe(3);
    expect(summary.analysisFailures).toBe(1);
    expect(summary.analyzedIncidents).toBe(2);
    // high+failed analysis, high+success, medium skipped
    expect(summary.notificationAttempts).toBe(2);
    expect(summary.notificationsSent).toBe(2);
    expect(summary.notificationsSkipped).toBe(1);
    expect(notifier.callCount).toBe(2);
  });

  it('skips notifier when notifierName is none', async () => {
    const notifier = new FakeIncidentNotifier();
    const summary = await run([candidate()], {
      notifier,
      notifierName: 'none',
    });
    expect(summary.notificationsSkipped).toBe(1);
    expect(summary.notificationAttempts).toBe(0);
    expect(notifier.callCount).toBe(0);
  });

  it('returns zero counts for an empty candidate list', async () => {
    const summary = await run([]);
    expect(summary).toEqual({
      attemptedIncidents: 0,
      persistedIncidents: 0,
      duplicateIncidents: 0,
      mappingFailures: 0,
      persistenceFailures: 0,
      analysisAttempts: 0,
      analyzedIncidents: 0,
      analysisFailures: 0,
      analysisPersistenceFailures: 0,
      notificationAttempts: 0,
      notificationsSent: 0,
      notificationFailures: 0,
      notificationsSkipped: 0,
      persistedIncidentIds: [],
    });
  });
});
