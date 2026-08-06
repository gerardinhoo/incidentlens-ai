import pino from 'pino';
import { describe, expect, it } from 'vitest';

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
    ...overrides,
  };
}

class FailingThenSucceedingRepository implements IncidentRepository {
  private calls = 0;
  readonly created: Incident[] = [];

  save(incident: Incident): Promise<Incident> {
    return Promise.resolve(incident);
  }

  saveIfAbsent(incident: Incident): Promise<SaveIfAbsentResult> {
    this.calls += 1;
    if (this.calls === 1) {
      return Promise.reject(new Error('simulated save failure'));
    }
    this.created.push(incident);
    return Promise.resolve('created');
  }

  findById(): Promise<Incident | undefined> {
    return Promise.resolve(undefined);
  }

  findAll(): Promise<Incident[]> {
    return Promise.resolve([...this.created]);
  }
}

describe('persistIncidentCandidates', () => {
  const log = pino({ level: 'silent' });

  it('creates and saves one incident from one candidate with deterministic id', async () => {
    const repository = new MemoryIncidentRepository();
    const summary = await persistIncidentCandidates([candidate()], {
      repository,
      log,
    });

    expect(summary).toMatchObject({
      attemptedIncidents: 1,
      persistedIncidents: 1,
      duplicateIncidents: 0,
      mappingFailures: 0,
      persistenceFailures: 0,
    });
    expect(summary.persistedIncidentIds).toHaveLength(1);

    const all = await repository.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(buildAutomaticIncidentId('evt-1'));
    expect(all[0]?.status).toBe('open');
    expect(Date.parse(all[0]!.createdAt)).not.toBeNaN();
    expect(all[0]?.source).toBe('incidentlens-demo-api');
    expect(all[0]?.severity).toBe('high');
  });

  it('saves two incidents from two different sourceEventIds', async () => {
    const repository = new MemoryIncidentRepository();
    const summary = await persistIncidentCandidates(
      [
        candidate({ sourceEventId: 'a' }),
        candidate({ sourceEventId: 'b', service: 'other-service' }),
      ],
      { repository, log },
    );
    expect(summary.attemptedIncidents).toBe(2);
    expect(summary.persistedIncidents).toBe(2);
    expect(summary.duplicateIncidents).toBe(0);
    expect((await repository.findAll()).length).toBe(2);
  });

  it('counts a second identical candidate as duplicate without failure', async () => {
    const repository = new MemoryIncidentRepository();
    const first = await persistIncidentCandidates([candidate()], {
      repository,
      log,
    });
    const original = (await repository.findAll())[0]!;
    const second = await persistIncidentCandidates(
      [candidate({ service: 'should-not-overwrite' })],
      { repository, log },
    );

    expect(first.persistedIncidents).toBe(1);
    expect(second.persistedIncidents).toBe(0);
    expect(second.duplicateIncidents).toBe(1);
    expect(second.persistenceFailures).toBe(0);
    expect(second.mappingFailures).toBe(0);
    expect(await repository.findAll()).toHaveLength(1);
    expect((await repository.findById(original.id))?.source).toBe(
      'incidentlens-demo-api',
    );
  });

  it('continues after a repository failure that is not a duplicate', async () => {
    const repository = new FailingThenSucceedingRepository();
    const summary = await persistIncidentCandidates(
      [
        candidate({ sourceEventId: 'fail' }),
        candidate({ sourceEventId: 'ok' }),
      ],
      { repository, log },
    );
    expect(summary.attemptedIncidents).toBe(2);
    expect(summary.persistedIncidents).toBe(1);
    expect(summary.duplicateIncidents).toBe(0);
    expect(summary.persistenceFailures).toBe(1);
    expect(summary.mappingFailures).toBe(0);
    expect(repository.created).toHaveLength(1);
  });

  it('continues after a mapping failure without counting it as persistenceFailures', async () => {
    const repository = new MemoryIncidentRepository();
    const bad = candidate({ sourceEventId: 'bad' });
    delete bad.severity;
    const summary = await persistIncidentCandidates(
      [bad, candidate({ sourceEventId: 'good' })],
      { repository, log },
    );
    expect(summary.attemptedIncidents).toBe(2);
    expect(summary.mappingFailures).toBe(1);
    expect(summary.persistenceFailures).toBe(0);
    expect(summary.persistedIncidents).toBe(1);
    expect(summary.duplicateIncidents).toBe(0);
    expect(
      summary.persistedIncidents +
        summary.duplicateIncidents +
        summary.mappingFailures +
        summary.persistenceFailures,
    ).toBe(summary.attemptedIncidents);
  });

  it('duplicate plus new candidate persists the new candidate', async () => {
    const repository = new MemoryIncidentRepository();
    await persistIncidentCandidates([candidate({ sourceEventId: 'same' })], {
      repository,
      log,
    });
    const summary = await persistIncidentCandidates(
      [
        candidate({ sourceEventId: 'same' }),
        candidate({ sourceEventId: 'fresh' }),
      ],
      { repository, log },
    );
    expect(summary.duplicateIncidents).toBe(1);
    expect(summary.persistedIncidents).toBe(1);
    expect(summary.persistenceFailures).toBe(0);
    expect(await repository.findAll()).toHaveLength(2);
  });

  it('returns zero counts for an empty candidate list', async () => {
    const repository = new MemoryIncidentRepository();
    const summary = await persistIncidentCandidates([], { repository, log });
    expect(summary).toEqual({
      attemptedIncidents: 0,
      persistedIncidents: 0,
      duplicateIncidents: 0,
      mappingFailures: 0,
      persistenceFailures: 0,
      persistedIncidentIds: [],
    });
  });
});
