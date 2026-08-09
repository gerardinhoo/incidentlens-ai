import type { IncidentNotifier } from '../../../../packages/notifications/src/index.js';

import type { ProcessorConfig } from '../config.js';
import { createIncidentNotifier } from './create-incident-notifier.js';

let cachedNotifier: IncidentNotifier | undefined;

/**
 * Resolve notifier factory config from processor env/config.
 */
export function resolveProcessorNotifierConfig(
  config: ProcessorConfig,
):
  | { provider: 'fake' }
  | { provider: 'none' }
  | { provider: 'sns'; topicArn: string; region: string } {
  if (config.incidentNotifier === 'fake') {
    return { provider: 'fake' };
  }
  if (config.incidentNotifier === 'none') {
    return { provider: 'none' };
  }

  const topicArn = config.snsIncidentTopicArn?.trim();
  if (!topicArn) {
    throw new Error(
      'SNS_INCIDENT_TOPIC_ARN is required when INCIDENT_NOTIFIER=sns',
    );
  }

  return {
    provider: 'sns',
    topicArn,
    region: process.env.AWS_REGION?.trim() || 'us-east-1',
  };
}

/** Cold-start cached notifier for Lambda composition. */
export function getProcessorNotifier(
  config: ProcessorConfig,
): IncidentNotifier {
  if (!cachedNotifier) {
    cachedNotifier = createIncidentNotifier(
      resolveProcessorNotifierConfig(config),
    );
  }
  return cachedNotifier;
}

/** Test helper. */
export function resetProcessorNotifierCache(): void {
  cachedNotifier = undefined;
}
