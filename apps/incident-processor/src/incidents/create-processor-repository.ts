import {
  createIncidentRepository,
  type IncidentRepository,
} from '../../../../packages/repository/src/index.js';

import type { ProcessorConfig } from '../config.js';

let cachedRepository: IncidentRepository | undefined;

/**
 * Build repository config from processor config (no Fastify / demo-api imports).
 */
export function resolveProcessorRepositoryConfig(config: ProcessorConfig):
  | {
      type: 'memory';
    }
  | {
      type: 'dynamodb';
      region: string;
      tableName: string;
    } {
  if (config.incidentRepository === 'memory') {
    return { type: 'memory' };
  }

  const tableName = config.dynamodbIncidentsTable;
  if (!tableName) {
    throw new Error(
      'DYNAMODB_INCIDENTS_TABLE is required when INCIDENT_REPOSITORY=dynamodb',
    );
  }

  return {
    type: 'dynamodb',
    region: process.env.AWS_REGION?.trim() || 'us-east-1',
    tableName,
  };
}

/** Cold-start cached repository for Lambda invocations. */
export function getProcessorRepository(
  config: ProcessorConfig,
): IncidentRepository {
  if (!cachedRepository) {
    cachedRepository = createIncidentRepository(
      resolveProcessorRepositoryConfig(config),
    );
  }
  return cachedRepository;
}

/** Test helper. */
export function resetProcessorRepositoryCache(): void {
  cachedRepository = undefined;
}
