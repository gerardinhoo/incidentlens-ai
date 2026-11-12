import { Writable } from 'node:stream';

import type { Context } from 'aws-lambda';
import pino, { type Logger } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';

import {
  loadIngestConfig,
  resetIngestConfigCache,
} from '../src/ingest-config.js';
import { handleIngestInvocation } from '../src/ingest-handler.js';
import { resetProcessorLogger } from '../src/logger.js';
import type { CandidateQueue } from '../src/sqs/candidate-queue.js';
import {
  baseDataPayload,
  candidatePinoMessage,
  controlPayload,
  encodeCloudWatchEnvelope,
  infoPinoMessage,
} from './helpers/cloudwatch-fixtures.js';

function captureLogger(): { logger: Logger; lines: unknown[] } {
  const lines: unknown[] = [];
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      lines.push(JSON.parse(text) as unknown);
      callback();
    },
  });
  const logger = pino(
    { level: 'info', base: { service: 'ingest-test' } },
    stream,
  );
  return { logger, lines };
}

function memoryQueue(): CandidateQueue & { bodies: string[] } {
  const bodies: string[] = [];
  return {
    bodies,
    send(body: string) {
      bodies.push(body);
      return Promise.resolve();
    },
  };
}

const fakeContext: Pick<Context, 'awsRequestId'> = {
  awsRequestId: 'ingest-test-req',
};

const ingestConfig = loadIngestConfig({
  NODE_ENV: 'test',
  SQS_CANDIDATES_QUEUE_URL:
    'https://sqs.us-east-1.amazonaws.com/123456789012/incidentlens-dev-incident-candidates',
});

afterEach(() => {
  resetIngestConfigCache();
  resetProcessorLogger();
});

describe('loadIngestConfig', () => {
  it('requires SQS_CANDIDATES_QUEUE_URL', () => {
    expect(() => loadIngestConfig({ NODE_ENV: 'test' })).toThrow(
      /SQS_CANDIDATES_QUEUE_URL/,
    );
  });
});

describe('handleIngestInvocation', () => {
  it('enqueues parsed candidates and ignores info logs', async () => {
    const { logger } = captureLogger();
    const queue = memoryQueue();
    const result = await handleIngestInvocation(
      encodeCloudWatchEnvelope(
        baseDataPayload([
          { id: '1', timestamp: 1, message: candidatePinoMessage() },
          { id: '2', timestamp: 2, message: infoPinoMessage() },
        ]),
      ),
      fakeContext,
      { config: ingestConfig, createLogger: () => logger, queue },
    );

    expect(result).toEqual({
      accepted: true,
      messageType: 'DATA_MESSAGE',
      receivedRecords: 2,
      processedRecords: 1,
      ignoredRecords: 1,
      failedRecords: 0,
      enqueuedIncidents: 1,
    });
    expect(queue.bodies).toHaveLength(1);
    const body = JSON.parse(queue.bodies[0]!) as { eventType: string };
    expect(body.eventType).toBe('incident_candidate');
  });

  it('does not enqueue CONTROL_MESSAGE', async () => {
    const { logger } = captureLogger();
    const queue = memoryQueue();
    const result = await handleIngestInvocation(
      encodeCloudWatchEnvelope(controlPayload()),
      fakeContext,
      { config: ingestConfig, createLogger: () => logger, queue },
    );
    expect(result.messageType).toBe('CONTROL_MESSAGE');
    expect(result.enqueuedIncidents).toBe(0);
    expect(queue.bodies).toEqual([]);
  });

  it('throws when enqueue fails so CloudWatch can retry ingest', async () => {
    const { logger } = captureLogger();
    await expect(
      handleIngestInvocation(
        encodeCloudWatchEnvelope(
          baseDataPayload([
            { id: '1', timestamp: 1, message: candidatePinoMessage() },
          ]),
        ),
        fakeContext,
        {
          config: ingestConfig,
          createLogger: () => logger,
          queue: {
            send: () => Promise.reject(new Error('sqs unavailable')),
          },
        },
      ),
    ).rejects.toThrow(/sqs unavailable/);
  });
});
