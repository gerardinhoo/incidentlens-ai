import {
  createIncidentRepository,
  type IncidentRepository,
  type IncidentRepositoryConfig,
} from '../../../../packages/repository/src/index.js';

/**
 * Resolves repository config from environment variables.
 * Fails clearly when DynamoDB is selected without required settings.
 */
export function resolveIncidentRepositoryConfig(
  environment: NodeJS.ProcessEnv = process.env,
): IncidentRepositoryConfig {
  const mode = (environment.INCIDENT_REPOSITORY ?? 'memory').toLowerCase();

  if (mode === 'memory') {
    return { type: 'memory' };
  }

  if (mode !== 'dynamodb') {
    throw new Error(
      `Invalid INCIDENT_REPOSITORY "${environment.INCIDENT_REPOSITORY ?? ''}". Allowed values: memory, dynamodb`,
    );
  }

  const tableName = environment.DYNAMODB_INCIDENTS_TABLE?.trim();

  if (!tableName) {
    throw new Error(
      'DYNAMODB_INCIDENTS_TABLE is required when INCIDENT_REPOSITORY=dynamodb',
    );
  }

  const config: IncidentRepositoryConfig = {
    type: 'dynamodb',
    region: environment.AWS_REGION ?? 'us-east-1',
    tableName,
  };

  const endpoint = environment.DYNAMODB_ENDPOINT?.trim();
  if (endpoint) {
    config.endpoint = endpoint;
  }

  return config;
}

export function createConfiguredIncidentRepository(
  environment: NodeJS.ProcessEnv = process.env,
): IncidentRepository {
  return createIncidentRepository(resolveIncidentRepositoryConfig(environment));
}
