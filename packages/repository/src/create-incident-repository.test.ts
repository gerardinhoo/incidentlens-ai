import { describe, expect, it, vi } from 'vitest';

import { createIncidentRepository } from './create-incident-repository.js';
import * as dynamodbClient from './dynamodb-client.js';
import { DynamoDbIncidentRepository } from './dynamodb-incident-repository.js';
import { MemoryIncidentRepository } from './memory-incident-repository.js';

describe('createIncidentRepository', () => {
  it('selects MemoryIncidentRepository for memory config', () => {
    const repository = createIncidentRepository({ type: 'memory' });

    expect(repository).toBeInstanceOf(MemoryIncidentRepository);
  });

  it('selects DynamoDbIncidentRepository and creates one document client', () => {
    const documentClient = { send: vi.fn() };
    const createClient = vi
      .spyOn(dynamodbClient, 'createIncidentDocumentClient')
      .mockReturnValue(documentClient as never);

    try {
      const repository = createIncidentRepository({
        type: 'dynamodb',
        region: 'us-east-1',
        tableName: 'incidents',
        endpoint: 'http://127.0.0.1:8000',
      });

      expect(repository).toBeInstanceOf(DynamoDbIncidentRepository);
      expect(createClient).toHaveBeenCalledTimes(1);
      expect(createClient).toHaveBeenCalledWith({
        region: 'us-east-1',
        endpoint: 'http://127.0.0.1:8000',
      });
    } finally {
      createClient.mockRestore();
    }
  });
});
