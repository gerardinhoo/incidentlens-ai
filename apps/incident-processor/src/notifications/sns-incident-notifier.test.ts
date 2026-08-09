import { PublishCommand } from '@aws-sdk/client-sns';
import { describe, expect, it, vi } from 'vitest';

import { IncidentNotificationError } from '../../../../packages/notifications/src/index.js';

import { SnsIncidentNotifier } from './sns-incident-notifier.js';

describe('SnsIncidentNotifier', () => {
  const input = {
    incidentId: 'inc-1',
    title: 'Database timeout',
    source: 'payments-api',
    severity: 'high' as const,
    status: 'open' as const,
    createdAt: '2026-08-09T12:00:00.000Z',
    analysis: {
      summary: 'Summary',
      possibleCause: 'Cause',
      recommendedActions: ['Check DB'],
    },
  };

  it('publishes to the configured topic with subject and message', async () => {
    const send = vi.fn().mockResolvedValue({ MessageId: 'msg-1' });
    const notifier = new SnsIncidentNotifier({
      topicArn: 'arn:aws:sns:us-east-1:123456789012:incidentlens-dev-incidents',
      client: { send },
    });

    await expect(notifier.notify(input)).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]![0] as PublishCommand;
    expect(command).toBeInstanceOf(PublishCommand);
    expect(command.input).toMatchObject({
      TopicArn: 'arn:aws:sns:us-east-1:123456789012:incidentlens-dev-incidents',
    });
    expect(command.input.Subject).toContain('[IncidentLens][HIGH]');
    expect(command.input.Message).toContain('inc-1');
    expect(command.input.Message).toContain('Summary');
  });

  it('surfaces SDK errors as safe IncidentNotificationError', async () => {
    const send = vi.fn().mockRejectedValue(new Error('AccessDenied'));
    const notifier = new SnsIncidentNotifier({
      topicArn: 'arn:aws:sns:us-east-1:123456789012:incidentlens-dev-incidents',
      client: { send },
    });

    await expect(notifier.notify(input)).rejects.toBeInstanceOf(
      IncidentNotificationError,
    );
    await expect(notifier.notify(input)).rejects.toMatchObject({
      category: 'SNS_PUBLISH_FAILED',
      message: 'Incident notification publish failed',
    });
  });

  it('requires a topic ARN', () => {
    expect(
      () =>
        new SnsIncidentNotifier({
          topicArn: '   ',
          client: { send: vi.fn() },
        }),
    ).toThrow(/SNS_INCIDENT_TOPIC_ARN/);
  });
});
