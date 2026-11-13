import type { Context, Handler, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import type { Logger } from 'pino';

import type { IncidentAnalyzer } from '../../../packages/analysis/src/index.js';
import type { IncidentNotifier } from '../../../packages/notifications/src/index.js';
import type { IncidentRepository } from '../../../packages/repository/src/index.js';

import { getProcessorAnalyzer } from './analysis/create-processor-analyzer.js';
import {
  decodeCloudWatchEvent,
  hasCloudWatchLogsEnvelope,
} from './cloudwatch/decode-cloudwatch-event.js';
import { parseCloudWatchPayload } from './cloudwatch/parse-cloudwatch-payload.js';
import { CloudWatchTransportError } from './cloudwatch/types.js';
import { getProcessorConfig, type ProcessorConfig } from './config.js';
import { getProcessorRepository } from './incidents/create-processor-repository.js';
import {
  persistIncidentCandidates,
  type IncidentPersistenceSummary,
} from './incidents/persist-incident-candidates.js';
import { createInvocationLogger } from './logger.js';
import { getProcessorNotifier } from './notifications/create-processor-notifier.js';
import { parseSqsCandidateBody } from './sqs/parse-sqs-candidate.js';
import type { ProcessorEventType, ProcessorResult } from './types.js';

export function isSqsEvent(event: unknown): event is SQSEvent {
  if (!event || typeof event !== 'object') {
    return false;
  }
  const records = (event as { Records?: unknown }).Records;
  if (!Array.isArray(records) || records.length === 0) {
    return false;
  }
  const first: unknown = records[0];
  return (
    typeof first === 'object' &&
    first !== null &&
    'eventSource' in first &&
    first.eventSource === 'aws:sqs'
  );
}

/**
 * Detect a CloudWatch Logs subscription envelope without reading payload content.
 */
export function classifyEventType(event: unknown): ProcessorEventType {
  if (isSqsEvent(event)) {
    return 'sqs';
  }
  return hasCloudWatchLogsEnvelope(event) ? 'cloudwatch_logs' : 'unclassified';
}

export interface ProcessorHandlerDeps {
  config?: ProcessorConfig;
  createLogger?: (config: ProcessorConfig, requestId: string) => Logger;
  repository?: IncidentRepository;
  analyzer?: IncidentAnalyzer;
  notifier?: IncidentNotifier;
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
    duplicateIncidents: 0,
    persistenceFailures: 0,
    analysisAttempts: 0,
    analyzedIncidents: 0,
    analysisFailures: 0,
    analysisPersistenceFailures: 0,
    notificationAttempts: 0,
    notificationsSent: 0,
    notificationFailures: 0,
    notificationsSkipped: 0,
  };
}

/**
 * Batch outcome:
 * - partially_failed: initial incident persistence failures
 * - partially_completed: incidents persisted but AI enrichment or notification failed
 * - completed: no persistence, enrichment, or notification failures
 *
 * AI/SNS failure must not fail/retry the CloudWatch batch (would re-invoke AI/SNS).
 */
export function batchOutcome(input: {
  persistenceFailures: number;
  attemptedIncidents: number;
  analysisFailures: number;
  analysisPersistenceFailures: number;
  notificationFailures?: number;
}): 'completed' | 'partially_failed' | 'partially_completed' {
  if (input.attemptedIncidents > 0 && input.persistenceFailures > 0) {
    return 'partially_failed';
  }
  if (
    input.analysisFailures > 0 ||
    input.analysisPersistenceFailures > 0 ||
    (input.notificationFailures ?? 0) > 0
  ) {
    return 'partially_completed';
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
  const analyzer = deps.analyzer ?? getProcessorAnalyzer(config);
  const notifier = deps.notifier ?? getProcessorNotifier(config);

  const eventType = classifyEventType(event);

  if (isSqsEvent(event)) {
    return handleSqsInvocation(event, {
      config,
      log,
      repository,
      analyzer,
      notifier,
    });
  }

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
        duplicateIncidents: 0,
        persistenceFailures: 0,
        analysisAttempts: 0,
        analyzedIncidents: 0,
        analysisFailures: 0,
        analysisPersistenceFailures: 0,
        notificationAttempts: 0,
        notificationsSent: 0,
        notificationFailures: 0,
        notificationsSkipped: 0,
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
        analyzer,
        notifier,
        log,
        analyzerName: config.incidentAnalyzer,
        notifierName: config.incidentNotifier,
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
      duplicateIncidents: persistence.duplicateIncidents,
      persistenceFailures: persistence.persistenceFailures,
      analysisAttempts: persistence.analysisAttempts,
      analyzedIncidents: persistence.analyzedIncidents,
      analysisFailures: persistence.analysisFailures,
      analysisPersistenceFailures: persistence.analysisPersistenceFailures,
      notificationAttempts: persistence.notificationAttempts,
      notificationsSent: persistence.notificationsSent,
      notificationFailures: persistence.notificationFailures,
      notificationsSkipped: persistence.notificationsSkipped,
    };

    const outcome = batchOutcome({
      persistenceFailures: result.persistenceFailures,
      attemptedIncidents: result.attemptedIncidents,
      analysisFailures: result.analysisFailures,
      analysisPersistenceFailures: result.analysisPersistenceFailures,
      notificationFailures: result.notificationFailures,
    });

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
        duplicateIncidents: result.duplicateIncidents,
        mappingFailures: persistence.mappingFailures,
        persistenceFailures: result.persistenceFailures,
        analysisAttempts: result.analysisAttempts,
        analyzedIncidents: result.analyzedIncidents,
        analysisFailures: result.analysisFailures,
        analysisPersistenceFailures: result.analysisPersistenceFailures,
        notificationAttempts: result.notificationAttempts,
        notificationsSent: result.notificationsSent,
        notificationFailures: result.notificationFailures,
        notificationsSkipped: result.notificationsSkipped,
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

function emptyPersistenceSummary(): IncidentPersistenceSummary {
  return {
    attemptedIncidents: 0,
    persistedIncidents: 0,
    duplicateIncidents: 0,
    mappingFailures: 0,
    persistenceFailures: 0,
    analysisAttempts: 0,
    analyzedIncidents: 0,
    analysisFailures: 0,
    analysisPersistenceFailures: 0,
    notificationAttempts: 0,
    notificationsSent: 0,
    notificationFailures: 0,
    notificationsSkipped: 0,
    persistedIncidentIds: [],
  };
}

function addPersistenceSummary(
  total: IncidentPersistenceSummary,
  part: IncidentPersistenceSummary,
): void {
  total.attemptedIncidents += part.attemptedIncidents;
  total.persistedIncidents += part.persistedIncidents;
  total.duplicateIncidents += part.duplicateIncidents;
  total.mappingFailures += part.mappingFailures;
  total.persistenceFailures += part.persistenceFailures;
  total.analysisAttempts += part.analysisAttempts;
  total.analyzedIncidents += part.analyzedIncidents;
  total.analysisFailures += part.analysisFailures;
  total.analysisPersistenceFailures += part.analysisPersistenceFailures;
  total.notificationAttempts += part.notificationAttempts;
  total.notificationsSent += part.notificationsSent;
  total.notificationFailures += part.notificationFailures;
  total.notificationsSkipped += part.notificationsSkipped;
  total.persistedIncidentIds.push(...part.persistedIncidentIds);
}

async function handleSqsInvocation(
  event: SQSEvent,
  input: {
    config: ProcessorConfig;
    log: Logger;
    repository: IncidentRepository;
    analyzer: IncidentAnalyzer;
    notifier: IncidentNotifier;
  },
): Promise<ProcessorResult> {
  const persistDeps = {
    repository: input.repository,
    analyzer: input.analyzer,
    notifier: input.notifier,
    log: input.log,
    analyzerName: input.config.incidentAnalyzer,
    notifierName: input.config.incidentNotifier,
  };

  const persistence = emptyPersistenceSummary();
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];
  let processedRecords = 0;
  let failedRecords = 0;

  for (const record of event.Records) {
    try {
      const candidate = parseSqsCandidateBody(record.body);
      const recordPersistence = await persistIncidentCandidates(
        [candidate],
        persistDeps,
      );
      addPersistenceSummary(persistence, recordPersistence);

      if (
        recordPersistence.mappingFailures > 0 ||
        recordPersistence.persistenceFailures > 0
      ) {
        failedRecords += 1;
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      processedRecords += 1;
    } catch {
      failedRecords += 1;
      batchItemFailures.push({ itemIdentifier: record.messageId });
      input.log.error(
        {
          eventType: 'sqs',
          messageId: record.messageId,
          outcome: 'failed',
        },
        'sqs record failed',
      );
    }
  }

  const result: ProcessorResult = {
    accepted: true,
    messageType: 'DATA_MESSAGE',
    receivedRecords: event.Records.length,
    processedRecords,
    ignoredRecords: 0,
    failedRecords,
    attemptedIncidents: persistence.attemptedIncidents,
    persistedIncidents: persistence.persistedIncidents,
    duplicateIncidents: persistence.duplicateIncidents,
    persistenceFailures: persistence.persistenceFailures,
    analysisAttempts: persistence.analysisAttempts,
    analyzedIncidents: persistence.analyzedIncidents,
    analysisFailures: persistence.analysisFailures,
    analysisPersistenceFailures: persistence.analysisPersistenceFailures,
    notificationAttempts: persistence.notificationAttempts,
    notificationsSent: persistence.notificationsSent,
    notificationFailures: persistence.notificationFailures,
    notificationsSkipped: persistence.notificationsSkipped,
    batchItemFailures,
  };

  const outcome = batchOutcome({
    persistenceFailures: result.persistenceFailures,
    attemptedIncidents: result.attemptedIncidents,
    analysisFailures: result.analysisFailures,
    analysisPersistenceFailures: result.analysisPersistenceFailures,
    notificationFailures: result.notificationFailures,
  });

  input.log.info(
    {
      eventType: 'sqs',
      receivedRecords: result.receivedRecords,
      processedRecords: result.processedRecords,
      failedRecords: result.failedRecords,
      attemptedIncidents: result.attemptedIncidents,
      persistedIncidents: result.persistedIncidents,
      duplicateIncidents: result.duplicateIncidents,
      mappingFailures: persistence.mappingFailures,
      persistenceFailures: result.persistenceFailures,
      analysisAttempts: result.analysisAttempts,
      analyzedIncidents: result.analyzedIncidents,
      analysisFailures: result.analysisFailures,
      analysisPersistenceFailures: result.analysisPersistenceFailures,
      notificationAttempts: result.notificationAttempts,
      notificationsSent: result.notificationsSent,
      notificationFailures: result.notificationFailures,
      notificationsSkipped: result.notificationsSkipped,
      batchItemFailureCount: batchItemFailures.length,
      accepted: true,
      outcome,
    },
    'sqs candidate batch processed',
  );

  return result;
}

/**
 * AWS Lambda entrypoint for the incident processor (SQS worker).
 * SQS events return ReportBatchItemFailures so only failed message IDs retry.
 * CloudWatch envelopes remain supported for local tests and invoke-processor-local.
 */
export const handler: Handler<
  unknown,
  ProcessorResult | SQSBatchResponse
> = async (event, context) => {
  const result = await handleProcessorInvocation(event, context);
  if (isSqsEvent(event)) {
    return { batchItemFailures: result.batchItemFailures ?? [] };
  }
  return result;
};
