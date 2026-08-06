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

  it('returns all saved incidents newest createdAt first', async () => {
    const repository = new MemoryIncidentRepository();
    const older = {
      ...buildIncident({ title: 'Older incident' }),
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    };
    const newer = {
      ...buildIncident({ title: 'Newer incident', severity: 'low' }),
      createdAt: '2026-01-02T10:00:00.000Z',
      updatedAt: '2026-01-02T10:00:00.000Z',
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };

    await repository.save(older);
    await repository.save(newer);

    const all = await repository.findAll();

    expect(all).toEqual([newer, older]);
  });

  it('uses updatedAt then id as stable findAll tie-breakers', async () => {
    const repository = new MemoryIncidentRepository();
    const sameCreated = '2026-01-01T12:00:00.000Z';
    const first = {
      ...buildIncident({ title: 'First by id' }),
      createdAt: sameCreated,
      updatedAt: sameCreated,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    };
    const second = {
      ...buildIncident({ title: 'Second by id' }),
      createdAt: sameCreated,
      updatedAt: sameCreated,
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };

    await repository.save(second);
    await repository.save(first);

    await expect(repository.findAll()).resolves.toEqual([first, second]);
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

  it('overwrites an existing incident when saving the same id', async () => {
    const repository = new MemoryIncidentRepository();
    const original = buildIncident({ title: 'Original title' });
    await repository.save(original);

    const updated = {
      ...original,
      title: 'Updated title',
      status: 'investigating' as const,
      updatedAt: '2026-02-01T00:00:00.000Z',
    };
    await repository.save(updated);

    const found = await repository.findById(original.id);
    expect(found).toEqual(updated);
    await expect(repository.findAll()).resolves.toEqual([updated]);
  });

  it('returns an empty array when no incidents are stored', async () => {
    const repository = new MemoryIncidentRepository();

    await expect(repository.findAll()).resolves.toEqual([]);
  });

  it('isolates stored state from mutations on returned copies', async () => {
    const repository = new MemoryIncidentRepository();
    const incident = buildIncident();
    await repository.save(incident);

    const found = await repository.findById(incident.id);
    expect(found).toBeDefined();
    found!.title = 'mutated after read';
    found!.metadata.service = 'mutated-after-read';

    const reread = await repository.findById(incident.id);
    expect(reread?.title).toBe('API latency spike');
    expect(reread?.metadata).toEqual({ service: 'checkout' });
  });

  describe('saveIfAbsent', () => {
    it('creates when the id is absent', async () => {
      const repository = new MemoryIncidentRepository();
      const incident = buildIncident();

      await expect(repository.saveIfAbsent(incident)).resolves.toBe('created');
      await expect(repository.findById(incident.id)).resolves.toEqual(incident);
    });

    it('returns duplicate without overwriting an existing item', async () => {
      const repository = new MemoryIncidentRepository();
      const original = buildIncident({ title: 'Original' });
      await repository.saveIfAbsent(original);

      const attempt = {
        ...original,
        title: 'Should not win',
        status: 'resolved' as const,
        updatedAt: '2099-01-01T00:00:00.000Z',
      };
      await expect(repository.saveIfAbsent(attempt)).resolves.toBe('duplicate');

      const found = await repository.findById(original.id);
      expect(found).toEqual(original);
      expect(found?.title).toBe('Original');
      expect(found?.status).toBe('open');
    });

    it('allows a different id to create successfully', async () => {
      const repository = new MemoryIncidentRepository();
      const first = buildIncident({ title: 'First' });
      const second = { ...buildIncident({ title: 'Second' }), id: 'other-id' };

      await expect(repository.saveIfAbsent(first)).resolves.toBe('created');
      await expect(repository.saveIfAbsent(second)).resolves.toBe('created');
      expect(await repository.findAll()).toHaveLength(2);
    });

    it('still allows unconditional save() to update an existing incident', async () => {
      const repository = new MemoryIncidentRepository();
      const original = buildIncident({ title: 'Original' });
      await repository.saveIfAbsent(original);

      const updated = {
        ...original,
        title: 'Patched',
        status: 'investigating' as const,
        updatedAt: '2026-03-01T00:00:00.000Z',
      };
      await repository.save(updated);
      await expect(repository.findById(original.id)).resolves.toEqual(updated);
    });

    it('isolates concurrent conditional creates to one created and one duplicate', async () => {
      const repository = new MemoryIncidentRepository();
      const incident = buildIncident();

      const outcomes = await Promise.all([
        repository.saveIfAbsent(incident),
        repository.saveIfAbsent({
          ...incident,
          title: 'racing title',
        }),
      ]);

      expect(outcomes.sort()).toEqual(['created', 'duplicate']);
      expect(await repository.findAll()).toHaveLength(1);
      const stored = await repository.findById(incident.id);
      expect(stored?.title).toBe('API latency spike');
    });

    it('keeps repository instances isolated', async () => {
      const a = new MemoryIncidentRepository();
      const b = new MemoryIncidentRepository();
      const incident = buildIncident();

      await a.saveIfAbsent(incident);
      await expect(b.findById(incident.id)).resolves.toBeUndefined();
      await expect(b.saveIfAbsent(incident)).resolves.toBe('created');
    });
  });
});
