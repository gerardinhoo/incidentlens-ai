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

  it('creates, analyzes, and persists completed analysis for a new candidate', async () => {
    const repository = new MemoryIncidentRepository();
    const analyzer = new CapturingAnalyzer();
    const summary = await persistIncidentCandidates([candidate()], {
      repository,
      analyzer,
      log,
      analyzerName: 'fake',
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
  });

  it('does not call analyzer again for duplicates', async () => {
    const repository = new MemoryIncidentRepository();
    const analyzer = new FakeIncidentAnalyzer();
    const first = await persistIncidentCandidates([candidate()], {
      repository,
      analyzer,
      log,
    });
    const original = (await repository.findAll())[0]!;
    const callsAfterFirst = analyzer.callCount;

    const second = await persistIncidentCandidates(
      [candidate({ service: 'should-not-overwrite' })],
      { repository, analyzer, log },
    );

    expect(first.analyzedIncidents).toBe(1);
    expect(second.persistedIncidents).toBe(0);
    expect(second.duplicateIncidents).toBe(1);
    expect(second.analysisAttempts).toBe(0);
    expect(analyzer.callCount).toBe(callsAfterFirst);
    expect((await repository.findById(original.id))?.analysis?.status).toBe(
      'completed',
    );
    expect((await repository.findById(original.id))?.source).toBe(
      'incidentlens-demo-api',
    );
  });

  it('keeps the incident when analyzer fails and marks analysis failed', async () => {
    const repository = new MemoryIncidentRepository();
    const analyzer = createFailingFakeIncidentAnalyzer(
      'BEDROCK_INVOCATION_FAILED',
    );
    const summary = await persistIncidentCandidates([candidate()], {
      repository,
      analyzer,
      log,
      analyzerName: 'fake',
    });

    expect(summary.persistedIncidents).toBe(1);
    expect(summary.analysisAttempts).toBe(1);
    expect(summary.analyzedIncidents).toBe(0);
    expect(summary.analysisFailures).toBe(1);
    expect(summary.analysisPersistenceFailures).toBe(0);

    const stored = (await repository.findAll())[0]!;
    expect(stored.status).toBe('open');
    expect(stored.analysis?.status).toBe('failed');
    expect(stored.analysis?.summary).toBeUndefined();
    expect(stored.analysis?.possibleCause).toBeUndefined();
    expect(stored.analysis?.recommendedActions).toBeUndefined();
    expect(stored.analysis?.analyzedAt).toBeTruthy();
  });

  it('counts analysisPersistenceFailures when enrichment save fails', async () => {
    const repository = new CreateOkSaveFailsRepository();
    const analyzer = new FakeIncidentAnalyzer();
    const summary = await persistIncidentCandidates([candidate()], {
      repository,
      analyzer,
      log,
    });

    expect(summary.persistedIncidents).toBe(1);
    expect(summary.analysisAttempts).toBe(1);
    expect(summary.analyzedIncidents).toBe(0);
    expect(summary.analysisFailures).toBe(0);
    expect(summary.analysisPersistenceFailures).toBe(1);
    expect(summary.duplicateIncidents).toBe(0);
    // Incident from saveIfAbsent remains with pending analysis.
    const stored = (await repository.findAll())[0]!;
    expect(stored.analysis?.status).toBe('pending');
  });

  it('continues after a repository failure that is not a duplicate', async () => {
    const repository = new FailingThenSucceedingRepository();
    const analyzer = new FakeIncidentAnalyzer();
    const summary = await persistIncidentCandidates(
      [
        candidate({ sourceEventId: 'fail' }),
        candidate({ sourceEventId: 'ok' }),
      ],
      { repository, analyzer, log },
    );
    expect(summary.attemptedIncidents).toBe(2);
    expect(summary.persistedIncidents).toBe(1);
    expect(summary.persistenceFailures).toBe(1);
    expect(summary.analysisAttempts).toBe(1);
    expect(summary.analyzedIncidents).toBe(1);
    expect(repository.created.size).toBe(1);
  });

  it('continues after mapping failure without counting as persistenceFailures', async () => {
    const repository = new MemoryIncidentRepository();
    const analyzer = new FakeIncidentAnalyzer();
    const bad = candidate({ sourceEventId: 'bad' });
    delete bad.severity;
    const summary = await persistIncidentCandidates(
      [bad, candidate({ sourceEventId: 'good' })],
      { repository, analyzer, log },
    );
    expect(summary.mappingFailures).toBe(1);
    expect(summary.persistedIncidents).toBe(1);
    expect(summary.analyzedIncidents).toBe(1);
    expect(
      summary.persistedIncidents +
        summary.duplicateIncidents +
        summary.mappingFailures +
        summary.persistenceFailures,
    ).toBe(summary.attemptedIncidents);
  });

  it('handles mixed success, analyzer failure, duplicate, mapping, and create failure', async () => {
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

    const bad = candidate({ sourceEventId: 'map-bad' });
    delete bad.severity;

    const summary = await persistIncidentCandidates(
      [
        candidate({ sourceEventId: 'create-fail' }),
        bad,
        candidate({ sourceEventId: 'analyze-fail' }),
        candidate({ sourceEventId: 'analyze-fail' }),
        candidate({ sourceEventId: 'success' }),
      ],
      { repository, analyzer: selective, log },
    );

    expect(summary.attemptedIncidents).toBe(5);
    expect(summary.persistenceFailures).toBe(1);
    expect(summary.mappingFailures).toBe(1);
    expect(summary.persistedIncidents).toBe(2);
    expect(summary.duplicateIncidents).toBe(1);
    expect(summary.analysisAttempts).toBe(2);
    expect(summary.analysisFailures).toBe(1);
    expect(summary.analyzedIncidents).toBe(1);
  });

  it('returns zero counts for an empty candidate list', async () => {
    const repository = new MemoryIncidentRepository();
    const summary = await persistIncidentCandidates([], {
      repository,
      analyzer: new FakeIncidentAnalyzer(),
      log,
    });
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
      persistedIncidentIds: [],
    });
  });
});
