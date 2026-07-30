import { afterAll, describe, expect, it, vi } from 'vitest';

import {
  createIncident,
  type Incident,
} from '../../../../packages/domain/src/index.js';
import {
  MemoryIncidentRepository,
  type IncidentRepository,
} from '../../../../packages/repository/src/index.js';
import { buildApp } from '../app.js';

const validMinimal = {
  title: 'API down',
  source: 'demo-api',
  severity: 'high',
  errorType: 'TimeoutError',
} as const;

describe('GET /incidents', () => {
  describe('with MemoryIncidentRepository', () => {
    const incidentRepository = new MemoryIncidentRepository();
    const appPromise = buildApp({
      logger: false,
      incidentRepository,
    });

    afterAll(async () => {
      const app = await appPromise;
      await app.close();
    });

    it('returns 200 and an empty array when no incidents exist', async () => {
      const emptyRepository = new MemoryIncidentRepository();
      const app = await buildApp({
        logger: false,
        incidentRepository: emptyRepository,
      });

      try {
        const response = await app.inject({
          method: 'GET',
          url: '/incidents',
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toMatch(/application\/json/);
        expect(response.json<Incident[]>()).toEqual([]);
      } finally {
        await app.close();
      }
    });

    it('returns one stored incident', async () => {
      const app = await appPromise;
      const stored = createIncident({
        title: 'Single incident',
        source: 'demo-api',
        severity: 'medium',
        errorType: 'Error',
      });
      await incidentRepository.save(stored);

      const response = await app.inject({
        method: 'GET',
        url: '/incidents',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.json<Incident[]>()).toEqual(
        expect.arrayContaining([stored]),
      );
    });

    it('returns multiple incidents newest createdAt first', async () => {
      const repository = new MemoryIncidentRepository();
      const app = await buildApp({
        logger: false,
        incidentRepository: repository,
      });

      try {
        const older = {
          ...createIncident({
            title: 'Older',
            source: 'demo-api',
            severity: 'low',
            errorType: 'Error',
          }),
          createdAt: '2026-01-01T10:00:00.000Z',
          updatedAt: '2026-01-01T10:00:00.000Z',
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        };
        const newer = {
          ...createIncident({
            title: 'Newer',
            source: 'demo-api',
            severity: 'high',
            errorType: 'Error',
          }),
          createdAt: '2026-01-02T10:00:00.000Z',
          updatedAt: '2026-01-02T10:00:00.000Z',
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        };

        await repository.save(older);
        await repository.save(newer);

        const response = await app.inject({
          method: 'GET',
          url: '/incidents',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json<Incident[]>()).toEqual([newer, older]);
      } finally {
        await app.close();
      }
    });

    it('lists incidents created via POST on the same app/repository', async () => {
      const repository = new MemoryIncidentRepository();
      const app = await buildApp({
        logger: false,
        incidentRepository: repository,
      });

      try {
        const first = await app.inject({
          method: 'POST',
          url: '/incidents',
          headers: { 'content-type': 'application/json' },
          payload: JSON.stringify({
            ...validMinimal,
            title: 'First created',
          }),
        });
        const second = await app.inject({
          method: 'POST',
          url: '/incidents',
          headers: { 'content-type': 'application/json' },
          payload: JSON.stringify({
            ...validMinimal,
            title: 'Second created',
          }),
        });

        expect(first.statusCode).toBe(201);
        expect(second.statusCode).toBe(201);

        const createdFirst = first.json<Incident>();
        const createdSecond = second.json<Incident>();

        const listResponse = await app.inject({
          method: 'GET',
          url: '/incidents',
        });

        expect(listResponse.statusCode).toBe(200);
        expect(listResponse.headers['content-type']).toMatch(
          /application\/json/,
        );
        expect(listResponse.json<Incident[]>()).toEqual(
          await repository.findAll(),
        );
        expect(
          listResponse.json<Incident[]>().map((incident) => incident.id),
        ).toEqual(expect.arrayContaining([createdFirst.id, createdSecond.id]));
      } finally {
        await app.close();
      }
    });
  });

  describe('with an injected repository', () => {
    it('invokes repository.findAll', async () => {
      const findAll = vi.fn(() => Promise.resolve([]));
      const repository: IncidentRepository = {
        save: vi.fn(),
        findById: vi.fn(),
        findAll,
      };

      const app = await buildApp({
        logger: false,
        incidentRepository: repository,
      });

      try {
        const response = await app.inject({
          method: 'GET',
          url: '/incidents',
        });

        expect(findAll).toHaveBeenCalledTimes(1);
        expect(response.statusCode).toBe(200);
        expect(response.json<Incident[]>()).toEqual([]);
      } finally {
        await app.close();
      }
    });

    it('does not convert repository failures into an empty array', async () => {
      const repository: IncidentRepository = {
        save: vi.fn(),
        findById: vi.fn(),
        findAll: vi.fn(() =>
          Promise.reject(new Error('Incident repository findAll failed')),
        ),
      };

      const app = await buildApp({
        logger: false,
        incidentRepository: repository,
      });

      try {
        const response = await app.inject({
          method: 'GET',
          url: '/incidents',
        });

        expect(response.statusCode).not.toBe(200);
        expect(response.statusCode).toBeGreaterThanOrEqual(500);
        expect(response.json<unknown>()).not.toEqual([]);
        expect(response.body).not.toMatch(/DynamoDB|UnrecognizedClient|AWS/i);
      } finally {
        await app.close();
      }
    });
  });
});
