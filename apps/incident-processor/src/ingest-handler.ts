import type { Context, Handler } from 'aws-lambda';
import type { Logger } from 'pino';

import {
  decodeCloudWatchEvent,
  hasCloudWatchLogsEnvelope,
} from './cloudwatch/decode-cloudwatch-event.js';
import { parseCloudWatchPayload } from './cloudwatch/parse-cloudwatch-payload.js';
import { CloudWatchTransportError } from './cloudwatch/types.js';
import { getIngestConfig, type IngestConfig } from './ingest-config.js';
import { createInvocationLogger } from './logger.js';
import {
  createSqsCandidateQueue,
  type CandidateQueue,
} from './sqs/candidate-queue.js';

export interface IngestResult {
  accepted: boolean;
  messageType: 'DATA_MESSAGE' | 'CONTROL_MESSAGE' | 'unclassified';
  receivedRecords: number;
  processedRecords: number;
  ignoredRecords: number;
  failedRecords: number;
  enqueuedIncidents: number;
}

export interface IngestHandlerDeps {
  config?: IngestConfig;
  createLogger?: (config: IngestConfig, requestId: string) => Logger;
  queue?: CandidateQueue;
}

function emptyIngestResult(
  messageType: IngestResult['messageType'],
): IngestResult {
  return {
    accepted: true,
    messageType,
    receivedRecords: 0,
    processedRecords: 0,
    ignoredRecords: 0,
    failedRecords: 0,
    enqueuedIncidents: 0,
  };
}

/**
 * CloudWatch Logs → SQS. Does not persist, analyze, or notify.
 * Transport failures throw so CloudWatch can retry ingest only.
 */
export async function handleIngestInvocation(
  event: unknown,
  context: Pick<Context, 'awsRequestId'>,
  deps: IngestHandlerDeps = {},
): Promise<IngestResult> {
  const config = deps.config ?? getIngestConfig();
  const createLogger = deps.createLogger ?? createInvocationLogger;
  const log = createLogger(config, context.awsRequestId);
  const queue =
    deps.queue ?? createSqsCandidateQueue(config.sqsCandidatesQueueUrl);

  if (!hasCloudWatchLogsEnvelope(event)) {
    log.info(
      {
        eventType: 'unclassified',
        ...emptyIngestResult('unclassified'),
        outcome: 'accepted',
      },
      'ingest invocation received',
    );
    return emptyIngestResult('unclassified');
  }

  try {
    const decoded = await decodeCloudWatchEvent(event);
    const batch = parseCloudWatchPayload(decoded);

    if (batch.messageType === 'CONTROL_MESSAGE') {
      const result = emptyIngestResult('CONTROL_MESSAGE');
      log.info(
        {
          eventType: 'cloudwatch_logs',
          logGroup: batch.logGroup,
          logStream: batch.logStream,
          ...result,
          outcome: 'completed',
        },
        'ingest cloudwatch control message received',
      );
      return result;
    }

    for (const candidate of batch.parsedCandidates) {
      await queue.send(JSON.stringify(candidate));
    }

    const result: IngestResult = {
      accepted: true,
      messageType: 'DATA_MESSAGE',
      receivedRecords: batch.receivedRecords,
      processedRecords: batch.parsedCandidates.length,
      ignoredRecords: batch.ignoredRecords,
      failedRecords: batch.failedRecords,
      enqueuedIncidents: batch.parsedCandidates.length,
    };

    log.info(
      {
        eventType: 'cloudwatch_logs',
        logGroup: batch.logGroup,
        logStream: batch.logStream,
        ...result,
        outcome: 'completed',
      },
      'ingest cloudwatch data message enqueued',
    );

    return result;
  } catch (error) {
    const category =
      error instanceof CloudWatchTransportError
        ? error.category
        : 'enqueue_failed';

    log.error(
      {
        eventType: 'cloudwatch_logs',
        errorCategory: category,
        outcome: 'failed',
      },
      'ingest failed',
    );

    throw error;
  }
}

export const handler: Handler<unknown, IngestResult> = (event, context) =>
  handleIngestInvocation(event, context);
