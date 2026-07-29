import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export type CreateIncidentDocumentClientOptions = {
  region: string;
  endpoint?: string;
};

/**
 * Creates a shared DynamoDB Document client for incident persistence.
 * Call once at application startup — not per request.
 */
export function createIncidentDocumentClient(
  options: CreateIncidentDocumentClientOptions,
): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    region: options.region,
    ...(options.endpoint !== undefined ? { endpoint: options.endpoint } : {}),
  });

  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });
}
