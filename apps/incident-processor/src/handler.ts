import type { Context, Handler } from 'aws-lambda';
import type { Logger } from 'pino';

import {
  decodeCloudWatchEvent,
  hasCloudWatchLogsEnvelope,
} from './cloudwatch/decode-cloudwatch-event.js';
import { parseCloudWatchPayload } from './cloudwatch/parse-cloudwatch-payload.js';
import { CloudWatchTransportError } from './cloudwatch/types.js';
import { getProcessorConfig, type ProcessorConfig } from './config.js';
import { createInvocationLogger } from './logger.js';
import type { ProcessorEventType, ProcessorResult } from './types.js';

/**
 * Detect a CloudWatch Logs subscription envelope without reading payload content.
 */
export function classifyEventType(event: unknown): ProcessorEventType {
  return hasCloudWatchLogsEnvelope(event) ? 'cloudwatch_logs' : 'unclassified';
}

export interface ProcessorHandlerDeps {
  config?: ProcessorConfig;
  createLogger?: (config: ProcessorConfig, requestId: string) => Logger;
}

function emptyUnclassifiedResult(): ProcessorResult {
  return {
    accepted: true,
    messageType: 'unclassified',
    receivedRecords: 0,
    processedRecords: 0,
    ignoredRecords: 0,
    failedRecords: 0,
  };
}

/**
 * Core processor invocation logic (unit-testable without AWS).
 */
export async function handleProcessorInvocation(
  event: unknown,
  context: Pick<Context, 'awsRequestId'>,
  deps: ProcessorHandlerDeps = {},
): Promise<ProcessorResult> {
  const config = deps.config ?? getProcessorConfig();
  const createLogger = deps.createLogger ?? createInvocationLogger;
  const log = createLogger(config, context.awsRequestId);

  const eventType = classifyEventType(event);

  if (eventType === 'unclassified') {
    // Preserve safe SCRUM-31/32 direct-invoke behavior for generic events.
    log.info(
      {
        eventType,
        hasAwsLogsData: false,
        accepted: true,
        messageType: 'unclassified',
        receivedRecords: 0,
        processedRecords: 0,
        ignoredRecords: 0,
        failedRecords: 0,
        outcome: 'accepted',
      },
      'processor invocation received',
    );
    return emptyUnclassifiedResult();
  }

  try {
    const decoded = await decodeCloudWatchEvent(event);
    const batch = parseCloudWatchPayload(decoded);

    const result: ProcessorResult = {
      accepted: true,
      messageType: batch.messageType,
      receivedRecords: batch.receivedRecords,
      processedRecords: batch.parsedCandidates.length,
      ignoredRecords: batch.ignoredRecords,
      failedRecords: batch.failedRecords,
    };

    // Safe summary only — never log awslogs.data, decoded payload, or candidates.
    log.info(
      {
        eventType: 'cloudwatch_logs',
        hasAwsLogsData: true,
        messageType: batch.messageType,
        logGroup: batch.logGroup,
        logStream: batch.logStream,
        receivedRecords: result.receivedRecords,
        processedRecords: result.processedRecords,
        ignoredRecords: result.ignoredRecords,
        failedRecords: result.failedRecords,
        accepted: true,
        outcome: 'accepted',
      },
      batch.messageType === 'CONTROL_MESSAGE'
        ? 'cloudwatch control message received'
        : 'cloudwatch data message processed',
    );

    return result;
  } catch (error) {
    const category =
      error instanceof CloudWatchTransportError
        ? error.category
        : 'invalid_payload_shape';

    log.error(
      {
        eventType: 'cloudwatch_logs',
        errorCategory: category,
        outcome: 'failed',
      },
      'cloudwatch transport parse failed',
    );

    // Fail the invocation so AWS can retry corrupt outer payloads.
    throw error;
  }
}

/**
 * AWS Lambda entrypoint for the incident processor.
 */
export const handler: Handler<unknown, ProcessorResult> = (event, context) =>
  handleProcessorInvocation(event, context);
