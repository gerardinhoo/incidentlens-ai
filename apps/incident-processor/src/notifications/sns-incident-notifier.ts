import {
  PublishCommand,
  SNSClient,
  type SNSClientConfig,
} from '@aws-sdk/client-sns';

import {
  IncidentNotificationError,
  buildIncidentNotificationMessage,
  type IncidentNotificationInput,
  type IncidentNotifier,
} from '../../../../packages/notifications/src/index.js';

export type SnsClientLike = Pick<SNSClient, 'send'>;

export interface SnsIncidentNotifierOptions {
  topicArn: string;
  client?: SnsClientLike;
  region?: string;
  clientConfig?: SNSClientConfig;
}

/**
 * Publishes allow-listed incident notifications to an SNS topic.
 * Client is injected or created once by the factory (not per candidate).
 */
export class SnsIncidentNotifier implements IncidentNotifier {
  private readonly topicArn: string;
  private readonly client: SnsClientLike;

  constructor(options: SnsIncidentNotifierOptions) {
    const topicArn = options.topicArn?.trim();
    if (!topicArn) {
      throw new Error(
        'SNS_INCIDENT_TOPIC_ARN is required when INCIDENT_NOTIFIER=sns',
      );
    }
    this.topicArn = topicArn;
    this.client =
      options.client ??
      new SNSClient({
        region: options.region?.trim() || process.env.AWS_REGION || 'us-east-1',
        ...options.clientConfig,
      });
  }

  async notify(input: IncidentNotificationInput): Promise<void> {
    const { subject, body } = buildIncidentNotificationMessage(input);

    try {
      await this.client.send(
        new PublishCommand({
          TopicArn: this.topicArn,
          Subject: subject,
          Message: body,
        }),
      );
    } catch (error) {
      throw new IncidentNotificationError(
        'SNS_PUBLISH_FAILED',
        'Incident notification publish failed',
        { cause: error },
      );
    }
  }
}
