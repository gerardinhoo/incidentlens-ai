import { describe, expect, it, vi } from 'vitest';

import {
  FakeIncidentNotifier,
  NoopIncidentNotifier,
} from '../../../../packages/notifications/src/index.js';

import { createIncidentNotifier } from './create-incident-notifier.js';
import { SnsIncidentNotifier } from './sns-incident-notifier.js';

describe('createIncidentNotifier', () => {
  it('creates fake and none notifiers', () => {
    expect(createIncidentNotifier({ provider: 'fake' })).toBeInstanceOf(
      FakeIncidentNotifier,
    );
    expect(createIncidentNotifier({ provider: 'none' })).toBeInstanceOf(
      NoopIncidentNotifier,
    );
  });

  it('creates sns notifier with injected client', () => {
    const notifier = createIncidentNotifier({
      provider: 'sns',
      topicArn: 'arn:aws:sns:us-east-1:123456789012:incidentlens-dev-incidents',
      client: { send: vi.fn() },
    });
    expect(notifier).toBeInstanceOf(SnsIncidentNotifier);
  });

  it('requires topic ARN for sns', () => {
    expect(() =>
      createIncidentNotifier({
        provider: 'sns',
        topicArn: '',
        client: { send: vi.fn() },
      }),
    ).toThrow(/SNS_INCIDENT_TOPIC_ARN/);
  });

  it('rejects unknown providers', () => {
    expect(() =>
      createIncidentNotifier({ provider: 'email' } as never),
    ).toThrow(/INCIDENT_NOTIFIER/);
  });
});
