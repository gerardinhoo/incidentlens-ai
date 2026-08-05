import type { Context, Handler } from 'aws-lambda';
import type { Logger } from 'pino';

import { getProcessorConfig, type ProcessorConfig } from './config.js';
import { createInvocationLogger } from './logger.js';
import type { ProcessorEventType, ProcessorResult } from './types.js';

/**
 * Detect a CloudWatch Logs subscription envelope without reading payload content.
 * Requires awslogs.data to be a string (typical Base64 gzip blob). Never decodes it.
 */
export function classifyEventType(event: unknown): ProcessorEventType {
  if (event === null || typeof event !== 'object') {
    return 'unclassified';
  }

  if (!('awslogs' in event)) {
    return 'unclassified';
  }

  const { awslogs } = event;
  if (awslogs === null || typeof awslogs !== 'object') {
    return 'unclassified';
  }

  if (!('data' in awslogs)) {
    return 'unclassified';
  }

  if (typeof awslogs.data !== 'string') {
    return 'unclassified';
  }

  return 'cloudwatch_logs';
}

export interface ProcessorHandlerDeps {
  config?: ProcessorConfig;
  createLogger?: (config: ProcessorConfig, requestId: string) => Logger;
}

/**
 * Core processor invocation logic (unit-testable without AWS).
 */
export function handleProcessorInvocation(
  event: unknown,
  context: Pick<Context, 'awsRequestId'>,
  deps: ProcessorHandlerDeps = {},
): ProcessorResult {
  const config = deps.config ?? getProcessorConfig();
  const createLogger = deps.createLogger ?? createInvocationLogger;
  const log = createLogger(config, context.awsRequestId);

  const eventType = classifyEventType(event);
  const processedRecords = 0;
  const accepted = true;
  const hasAwsLogsData = eventType === 'cloudwatch_logs';

  // Safe fields only — never log the full event or awslogs.data.
  log.info(
    {
      eventType,
      hasAwsLogsData,
      accepted,
      processedRecords,
      outcome: 'accepted',
    },
    'processor invocation received',
  );

  return {
    accepted,
    processedRecords,
  };
}

/**
 * AWS Lambda entrypoint for the incident processor foundation.
 */
export const handler: Handler<unknown, ProcessorResult> = (event, context) =>
  // Cold-start config is cached inside getProcessorConfig().
  Promise.resolve(handleProcessorInvocation(event, context));
