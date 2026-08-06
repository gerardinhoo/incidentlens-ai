import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  PutCommand,
  ScanCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

import type { Incident } from '../../domain/src/index.js';

import type {
  IncidentRepository,
  SaveIfAbsentResult,
} from './incident-repository.js';
import { sortIncidentsNewestFirst } from './sort-incidents.js';

function toPersistenceError(operation: string, error: unknown): Error {
  return new Error(`Incident repository ${operation} failed`, {
    cause: error,
  });
}

function asIncident(item: Record<string, unknown>): Incident {
  return item as unknown as Incident;
}

/**
 * True when DynamoDB rejected a conditional write because the item exists.
 * Checks the public ConditionalCheckFailedException type and error.name —
 * not private SDK internals.
 */
export function isConditionalCheckFailedException(error: unknown): boolean {
  if (error instanceof ConditionalCheckFailedException) {
    return true;
  }
  if (typeof error !== 'object' || error === null || !('name' in error)) {
    return false;
  }
  return error.name === 'ConditionalCheckFailedException';
}

/**
 * DynamoDB-backed IncidentRepository.
 * Stores Incident fields as-is with `id` as the partition key.
 */
export class DynamoDbIncidentRepository implements IncidentRepository {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async save(incident: Incident): Promise<Incident> {
    try {
      await this.documentClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: incident,
        }),
      );
      return incident;
    } catch (error) {
      throw toPersistenceError('save', error);
    }
  }

  async saveIfAbsent(incident: Incident): Promise<SaveIfAbsentResult> {
    try {
      await this.documentClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: incident,
          ConditionExpression: 'attribute_not_exists(#id)',
          ExpressionAttributeNames: {
            '#id': 'id',
          },
        }),
      );
      return 'created';
    } catch (error) {
      if (isConditionalCheckFailedException(error)) {
        return 'duplicate';
      }
      throw toPersistenceError('saveIfAbsent', error);
    }
  }

  async findById(id: string): Promise<Incident | undefined> {
    try {
      const result = await this.documentClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { id },
        }),
      );

      if (result.Item === undefined) {
        return undefined;
      }

      return asIncident(result.Item);
    } catch (error) {
      throw toPersistenceError('findById', error);
    }
  }

  async findAll(): Promise<Incident[]> {
    try {
      const result = await this.documentClient.send(
        new ScanCommand({
          TableName: this.tableName,
        }),
      );

      const incidents = (result.Items ?? []).map((item) => asIncident(item));
      return sortIncidentsNewestFirst(incidents);
    } catch (error) {
      throw toPersistenceError('findAll', error);
    }
  }
}
