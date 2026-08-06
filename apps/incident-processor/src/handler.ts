import type { Context, Handler } from 'aws-lambda';
import type { Logger } from 'pino';

import type { IncidentRepository } from '../../../packages/repository/src/index.js';

import {
  decodeCloudWatchEvent,
  hasCloudWatchLogsEnvelope,
} from './cloudwatch/decode-cloudwatch-event.js';
import { parseCloudWatchPayload } from './cloudwatch/parse-cloudwatch-payload.js';
import { CloudWatchTransportError } from './cloudwatch/types.js';
import { getProcessorConfig, type ProcessorConfig } from './config.js';
import { getProcessorRepository } from './incidents/create-processor-repository.js';
import { persistIncidentCandidates } from './incidents/persist-incident-candidates.js';
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
  repository?: IncidentRepository;
}

function emptyResult(
  messageType: ProcessorResult['messageType'],
): ProcessorResult {
  return {
    accepted: true,
    messageType,
    receivedRecords: 0,
    processedRecords: 0,
    ignoredRecords: 0,
    failedRecords: 0,
    attemptedIncidents: 0,
    persistedIncidents: 0,
    persistenceFailures: 0,
  };
}

function batchOutcome(
  persistenceFailures: number,
  attemptedIncidents: number,
): 'completed' | 'partially_failed' {
  if (attemptedIncidents > 0 && persistenceFailures > 0) {
    return 'partially_failed';
  }
  return 'completed';
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
  const repository = deps.repository ?? getProcessorRepository(config);

  const eventType = classifyEventType(event);

  if (eventType === 'unclassified') {
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
        attemptedIncidents: 0,
        persistedIncidents: 0,
        persistenceFailures: 0,
        outcome: 'accepted',
      },
      'processor invocation received',
    );
    return emptyResult('unclassified');
  }

  try {
    const decoded = await decodeCloudWatchEvent(event);
    const batch = parseCloudWatchPayload(decoded);

    if (batch.messageType === 'CONTROL_MESSAGE') {
      const result = emptyResult('CONTROL_MESSAGE');
      log.info(
        {
          eventType: 'cloudwatch_logs',
          logGroup: batch.logGroup,
          logStream: batch.logStream,
          ...result,
          outcome: 'completed',
        },
        'cloudwatch control message received',
      );
      return result;
    }

    const persistence = await persistIncidentCandidates(
      batch.parsedCandidates,
      {
        repository,
        log,
      },
    );

    const result: ProcessorResult = {
      accepted: true,
      messageType: 'DATA_MESSAGE',
      receivedRecords: batch.receivedRecords,
      processedRecords: batch.parsedCandidates.length,
      ignoredRecords: batch.ignoredRecords,
      failedRecords: batch.failedRecords,
      attemptedIncidents: persistence.attemptedIncidents,
      persistedIncidents: persistence.persistedIncidents,
      persistenceFailures: persistence.persistenceFailures,
    };

    const outcome = batchOutcome(
      result.persistenceFailures,
      result.attemptedIncidents,
    );

    log.info(
      {
        eventType: 'cloudwatch_logs',
        hasAwsLogsData: true,
        messageType: result.messageType,
        logGroup: batch.logGroup,
        logStream: batch.logStream,
        receivedRecords: result.receivedRecords,
        processedRecords: result.processedRecords,
        ignoredRecords: result.ignoredRecords,
        failedRecords: result.failedRecords,
        attemptedIncidents: result.attemptedIncidents,
        persistedIncidents: result.persistedIncidents,
        persistenceFailures: result.persistenceFailures,
        accepted: true,
        outcome,
      },
      'cloudwatch data message processed',
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

    throw error;
  }
}

/**
 * AWS Lambda entrypoint for the incident processor.
 */
export const handler: Handler<unknown, ProcessorResult> = (event, context) =>
  handleProcessorInvocation(event, context);
