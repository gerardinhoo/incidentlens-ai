import { createIncidentDocumentClient } from './dynamodb-client.js';
import { DynamoDbIncidentRepository } from './dynamodb-incident-repository.js';
import type { IncidentRepository } from './incident-repository.js';
import { MemoryIncidentRepository } from './memory-incident-repository.js';

export type IncidentRepositoryConfig =
  | {
      type: 'memory';
    }
  | {
      type: 'dynamodb';
      region: string;
      tableName: string;
      endpoint?: string;
    };

/**
 * Creates a single IncidentRepository instance for the process.
 */
export function createIncidentRepository(
  config: IncidentRepositoryConfig,
): IncidentRepository {
  if (config.type === 'memory') {
    return new MemoryIncidentRepository();
  }

  const documentClient = createIncidentDocumentClient({
    region: config.region,
    ...(config.endpoint !== undefined ? { endpoint: config.endpoint } : {}),
  });

  return new DynamoDbIncidentRepository(documentClient, config.tableName);
}
