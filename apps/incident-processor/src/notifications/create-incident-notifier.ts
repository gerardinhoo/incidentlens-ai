import type { SNSClientConfig } from '@aws-sdk/client-sns';
import { SNSClient } from '@aws-sdk/client-sns';

import {
  FakeIncidentNotifier,
  NoopIncidentNotifier,
  type IncidentNotifier,
} from '../../../../packages/notifications/src/index.js';

import {
  SnsIncidentNotifier,
  type SnsClientLike,
} from './sns-incident-notifier.js';

export type IncidentNotifierProvider = 'fake' | 'sns' | 'none';

export type CreateIncidentNotifierConfig =
  | {
      provider: 'fake';
    }
  | {
      provider: 'none';
    }
  | {
      provider: 'sns';
      topicArn: string;
      region?: string;
      client?: SnsClientLike;
      clientConfig?: SNSClientConfig;
    };

/**
 * Provider factory — keep selection outside persist logic.
 * No silent fallback from sns → fake.
 */
export function createIncidentNotifier(
  config: CreateIncidentNotifierConfig,
): IncidentNotifier {
  if (config.provider === 'fake') {
    return new FakeIncidentNotifier();
  }

  if (config.provider === 'none') {
    return new NoopIncidentNotifier();
  }

  if (config.provider === 'sns') {
    const topicArn = config.topicArn?.trim();
    if (!topicArn) {
      throw new Error(
        'SNS_INCIDENT_TOPIC_ARN is required when INCIDENT_NOTIFIER=sns',
      );
    }

    const client =
      config.client ??
      new SNSClient({
        region: config.region?.trim() || process.env.AWS_REGION || 'us-east-1',
        ...config.clientConfig,
      });

    const options: ConstructorParameters<typeof SnsIncidentNotifier>[0] = {
      topicArn,
      client,
    };
    if (config.region !== undefined) {
      options.region = config.region;
    }
    return new SnsIncidentNotifier(options);
  }

  const unknown = config as { provider?: string };
  throw new Error(
    `Invalid INCIDENT_NOTIFIER "${unknown.provider ?? ''}". Allowed values: fake, sns, none`,
  );
}
