import { describe, expect, it, vi } from 'vitest';

import type { Incident } from '../../../../packages/domain/src/index.js';
import {
  DynamoDbIncidentRepository,
  MemoryIncidentRepository,
} from '../../../../packages/repository/src/index.js';
import {
  createConfiguredIncidentRepository,
  resolveIncidentRepositoryConfig,
} from './incident-repository.js';

describe('incident repository configuration', () => {
  it('selects the memory repository by default', () => {
    const config = resolveIncidentRepositoryConfig({});

    expect(config).toEqual({ type: 'memory' });
    expect(createConfiguredIncidentRepository({})).toBeInstanceOf(
      MemoryIncidentRepository,
    );
  });

  it('selects DynamoDB when INCIDENT_REPOSITORY=dynamodb', () => {
    const config = resolveIncidentRepositoryConfig({
      INCIDENT_REPOSITORY: 'dynamodb',
      DYNAMODB_INCIDENTS_TABLE: 'incidents',
      AWS_REGION: 'us-west-2',
      DYNAMODB_ENDPOINT: 'http://127.0.0.1:8000',
    });

    expect(config).toEqual({
      type: 'dynamodb',
      region: 'us-west-2',
      tableName: 'incidents',
      endpoint: 'http://127.0.0.1:8000',
    });
    expect(
      createConfiguredIncidentRepository({
        INCIDENT_REPOSITORY: 'dynamodb',
        DYNAMODB_INCIDENTS_TABLE: 'incidents',
        AWS_REGION: 'us-west-2',
        DYNAMODB_ENDPOINT: 'http://127.0.0.1:8000',
      }),
    ).toBeInstanceOf(DynamoDbIncidentRepository);
  });

  it('fails clearly when DynamoDB is selected without a table name', () => {
    expect(() =>
      resolveIncidentRepositoryConfig({
        INCIDENT_REPOSITORY: 'dynamodb',
      }),
    ).toThrow(
      'DYNAMODB_INCIDENTS_TABLE is required when INCIDENT_REPOSITORY=dynamodb',
    );
  });

  it('fails clearly for an unsupported repository mode', () => {
    expect(() =>
      resolveIncidentRepositoryConfig({
        INCIDENT_REPOSITORY: 'postgres',
      }),
    ).toThrow('Invalid INCIDENT_REPOSITORY "postgres"');
  });

  it('createConfiguredIncidentRepository builds a memory repository', () => {
    const repository = createConfiguredIncidentRepository({
      INCIDENT_REPOSITORY: 'memory',
    });

    expect(repository).toBeInstanceOf(MemoryIncidentRepository);
  });

  it('buildApp can still use an injected repository override', async () => {
    const { buildApp } = await import('../app.js');
    const save = vi.fn((incident: Incident) => Promise.resolve(incident));
    const repository = {
      save,
      findById: vi.fn(),
      findAll: vi.fn(),
    };

    const app = await buildApp({
      logger: false,
      incidentRepository: repository,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        title: 'API down',
        source: 'demo-api',
        severity: 'high',
        errorType: 'TimeoutError',
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(save).toHaveBeenCalledTimes(1);

    await app.close();
  });
});
