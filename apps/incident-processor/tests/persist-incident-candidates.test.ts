import pino from 'pino';
import { describe, expect, it } from 'vitest';

import type { Incident } from '../../../packages/domain/src/index.js';
import type { IncidentRepository } from '../../../packages/repository/src/index.js';
import { MemoryIncidentRepository } from '../../../packages/repository/src/index.js';

import type { ParsedIncidentCandidate } from '../src/cloudwatch/types.js';
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
  readonly saved: Incident[] = [];

  save(incident: Incident): Promise<Incident> {
    this.calls += 1;
    if (this.calls === 1) {
      return Promise.reject(new Error('simulated save failure'));
    }
    this.saved.push(incident);
    return Promise.resolve(incident);
  }

  findById(): Promise<Incident | undefined> {
    return Promise.resolve(undefined);
  }

  findAll(): Promise<Incident[]> {
    return Promise.resolve([...this.saved]);
  }
}

describe('persistIncidentCandidates', () => {
  const log = pino({ level: 'silent' });

  it('creates and saves one incident from one candidate', async () => {
    const repository = new MemoryIncidentRepository();
    const summary = await persistIncidentCandidates([candidate()], {
      repository,
      log,
    });

    expect(summary).toMatchObject({
      attemptedIncidents: 1,
      persistedIncidents: 1,
      mappingFailures: 0,
      persistenceFailures: 0,
    });
    expect(summary.persistedIncidentIds).toHaveLength(1);

    const all = await repository.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(all[0]?.status).toBe('open');
    expect(Date.parse(all[0]!.createdAt)).not.toBeNaN();
    expect(Date.parse(all[0]!.updatedAt)).not.toBeNaN();
    expect(all[0]?.source).toBe('incidentlens-demo-api');
    expect(all[0]?.severity).toBe('high');
    expect(all[0]?.errorType).toBe('Error');
    expect(all[0]?.title).toBe('Error detected in incidentlens-demo-api');
  });

  it('saves two incidents from two candidates', async () => {
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
    expect((await repository.findAll()).length).toBe(2);
  });

  it('continues after a repository failure', async () => {
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
    expect(summary.persistenceFailures).toBe(1);
    expect(summary.mappingFailures).toBe(0);
    expect(repository.saved).toHaveLength(1);
  });

  it('continues after a mapping failure', async () => {
    const repository = new MemoryIncidentRepository();
    const bad = candidate({ sourceEventId: 'bad' });
    delete bad.severity;
    const summary = await persistIncidentCandidates(
      [bad, candidate({ sourceEventId: 'good' })],
      { repository, log },
    );
    expect(summary.attemptedIncidents).toBe(2);
    expect(summary.mappingFailures).toBe(1);
    expect(summary.persistenceFailures).toBe(1);
    expect(summary.persistedIncidents).toBe(1);
    expect((await repository.findAll()).length).toBe(1);
  });

  it('returns zero counts for an empty candidate list', async () => {
    const repository = new MemoryIncidentRepository();
    const summary = await persistIncidentCandidates([], { repository, log });
    expect(summary).toEqual({
      attemptedIncidents: 0,
      persistedIncidents: 0,
      mappingFailures: 0,
      persistenceFailures: 0,
      persistedIncidentIds: [],
    });
    expect(await repository.findAll()).toEqual([]);
  });
});
