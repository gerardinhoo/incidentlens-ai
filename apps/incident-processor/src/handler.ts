import type { Context, Handler } from 'aws-lambda';
import type { Logger } from 'pino';

import { getProcessorConfig, type ProcessorConfig } from './config.js';
import { createInvocationLogger } from './logger.js';
import type { ProcessorEventType, ProcessorResult } from './types.js';

/**
 * High-level classification only. Never serializes or logs the event payload.
 */
export function classifyEventType(event: unknown): ProcessorEventType {
  if (event !== null && typeof event === 'object' && 'awslogs' in event) {
    return 'awslogs';
  }
  return 'unclassified';
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

  // Safe fields only — never log the full event (may contain secrets / PII).
  log.info(
    {
      eventType,
      processedRecords,
      outcome: 'accepted',
    },
    'processor invocation received',
  );

  return {
    accepted: true,
    processedRecords,
  };
}

/**
 * AWS Lambda entrypoint for the incident processor foundation.
 */
export const handler: Handler<unknown, ProcessorResult> = (event, context) =>
  // Cold-start config is cached inside getProcessorConfig().
  Promise.resolve(handleProcessorInvocation(event, context));
