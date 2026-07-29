export type { IncidentRepository } from './incident-repository.js';
export { MemoryIncidentRepository } from './memory-incident-repository.js';
export { DynamoDbIncidentRepository } from './dynamodb-incident-repository.js';
export { createIncidentDocumentClient } from './dynamodb-client.js';
export {
  createIncidentRepository,
  type IncidentRepositoryConfig,
} from './create-incident-repository.js';
