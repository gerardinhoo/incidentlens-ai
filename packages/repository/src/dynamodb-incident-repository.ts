import {
  GetCommand,
  PutCommand,
  ScanCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

import type { Incident } from '../../domain/src/index.js';

import type { IncidentRepository } from './incident-repository.js';

function toPersistenceError(operation: string, error: unknown): Error {
  return new Error(`Incident repository ${operation} failed`, {
    cause: error,
  });
}

function asIncident(item: Record<string, unknown>): Incident {
  return item as unknown as Incident;
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

      return (result.Items ?? []).map((item) => asIncident(item));
    } catch (error) {
      throw toPersistenceError('findAll', error);
    }
  }
}
