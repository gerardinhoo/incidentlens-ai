import { describe, expect, it } from 'vitest';

import { createIncident } from '../../domain/src/index.js';
import { MemoryIncidentRepository } from './memory-incident-repository.js';

function buildIncident(
  overrides: Partial<Parameters<typeof createIncident>[0]> = {},
) {
  return createIncident({
    title: 'API latency spike',
    source: 'demo-api',
    severity: 'high',
    errorType: 'TimeoutError',
    description: 'p95 latency exceeded',
    requestId: 'req-123',
    metadata: { service: 'checkout' },
    ...overrides,
  });
}

describe('MemoryIncidentRepository', () => {
  it('saves an incident and returns a copy', async () => {
    const repository = new MemoryIncidentRepository();
    const incident = buildIncident();

    const saved = await repository.save(incident);

    expect(saved).toEqual(incident);
    expect(saved).not.toBe(incident);
  });

  it('finds a saved incident by id', async () => {
    const repository = new MemoryIncidentRepository();
    const incident = buildIncident();
    await repository.save(incident);

    const found = await repository.findById(incident.id);

    expect(found).toEqual(incident);
    expect(found).not.toBe(incident);
  });

  it('returns undefined for a missing incident', async () => {
    const repository = new MemoryIncidentRepository();

    await expect(
      repository.findById('00000000-0000-4000-8000-000000000000'),
    ).resolves.toBeUndefined();
  });

  it('returns all saved incidents', async () => {
    const repository = new MemoryIncidentRepository();
    const first = buildIncident({ title: 'First incident' });
    const second = buildIncident({
      title: 'Second incident',
      severity: 'low',
      errorType: 'ValidationError',
    });

    await repository.save(first);
    await repository.save(second);

    const all = await repository.findAll();

    expect(all).toHaveLength(2);
    expect(all).toEqual(expect.arrayContaining([first, second]));
  });

  it('preserves all incident fields through save and find', async () => {
    const repository = new MemoryIncidentRepository();
    const incident = buildIncident({
      title: 'Disk pressure',
      description: 'disk usage above 90%',
      source: 'node-exporter',
      severity: 'critical',
      errorType: 'DiskFull',
      requestId: 'client-req-9',
      metadata: { host: 'ip-10-0-0-1', mount: '/var' },
    });

    await repository.save(incident);
    const found = await repository.findById(incident.id);

    expect(found).toEqual({
      id: incident.id,
      title: 'Disk pressure',
      description: 'disk usage above 90%',
      source: 'node-exporter',
      severity: 'critical',
      status: 'open',
      errorType: 'DiskFull',
      requestId: 'client-req-9',
      metadata: { host: 'ip-10-0-0-1', mount: '/var' },
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
    });
  });

  it('isolates stored incidents from later caller mutations', async () => {
    const repository = new MemoryIncidentRepository();
    const incident = buildIncident();
    await repository.save(incident);

    incident.title = 'mutated';
    incident.metadata.service = 'mutated';

    const found = await repository.findById(incident.id);

    expect(found?.title).toBe('API latency spike');
    expect(found?.metadata).toEqual({ service: 'checkout' });
  });
});
