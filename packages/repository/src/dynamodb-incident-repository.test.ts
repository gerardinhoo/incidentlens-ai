import {
  GetCommand,
  PutCommand,
  ScanCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createIncident } from '../../domain/src/index.js';

import { DynamoDbIncidentRepository } from './dynamodb-incident-repository.js';

describe('DynamoDbIncidentRepository', () => {
  const send = vi.fn();
  const documentClient = { send } as unknown as DynamoDBDocumentClient;
  const tableName = 'incidents';
  let repository: DynamoDbIncidentRepository;

  beforeEach(() => {
    send.mockReset();
    repository = new DynamoDbIncidentRepository(documentClient, tableName);
  });

  it('save sends PutCommand with the table name and incident item', async () => {
    const incident = createIncident({
      title: 'API down',
      source: 'demo-api',
      severity: 'high',
      errorType: 'TimeoutError',
    });
    send.mockResolvedValue({});

    const saved = await repository.save(incident);

    expect(saved).toEqual(incident);
    expect(send).toHaveBeenCalledTimes(1);

    const command = send.mock.calls[0]?.[0] as PutCommand;
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input).toEqual({
      TableName: tableName,
      Item: incident,
    });
  });

  it('findById sends GetCommand with id and returns an Incident when found', async () => {
    const incident = createIncident({
      title: 'API down',
      source: 'demo-api',
      severity: 'high',
      errorType: 'TimeoutError',
    });
    send.mockResolvedValue({ Item: incident });

    const found = await repository.findById(incident.id);

    expect(found).toEqual(incident);

    const command = send.mock.calls[0]?.[0] as GetCommand;
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input).toEqual({
      TableName: tableName,
      Key: { id: incident.id },
    });
  });

  it('findById returns undefined when the item is missing', async () => {
    send.mockResolvedValue({});

    await expect(repository.findById('missing-id')).resolves.toBeUndefined();
  });

  it('findAll sends ScanCommand and returns incidents newest first', async () => {
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
        severity: 'medium',
        errorType: 'Error',
      }),
      createdAt: '2026-01-02T10:00:00.000Z',
      updatedAt: '2026-01-02T10:00:00.000Z',
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };
    // Scan order is intentionally reverse of the contract.
    send.mockResolvedValue({ Items: [older, newer] });

    const found = await repository.findAll();

    expect(found).toEqual([newer, older]);

    const command = send.mock.calls[0]?.[0] as ScanCommand;
    expect(command).toBeInstanceOf(ScanCommand);
    expect(command.input).toEqual({
      TableName: tableName,
    });
  });

  it('findAll returns an empty array when Scan has no Items', async () => {
    send.mockResolvedValue({});

    await expect(repository.findAll()).resolves.toEqual([]);
  });

  it('wraps DynamoDB failures without exposing AWS error details', async () => {
    send.mockRejectedValue(new Error('UnrecognizedClientException: bad key'));

    await expect(
      repository.save(
        createIncident({
          title: 'API down',
          source: 'demo-api',
          severity: 'high',
          errorType: 'TimeoutError',
        }),
      ),
    ).rejects.toThrow('Incident repository save failed');
  });

  it('propagates wrapped errors from findById and findAll', async () => {
    send.mockRejectedValue(new Error('ProvisionedThroughputExceededException'));

    await expect(repository.findById('any-id')).rejects.toThrow(
      'Incident repository findById failed',
    );

    await expect(repository.findAll()).rejects.toThrow(
      'Incident repository findAll failed',
    );
  });
});
