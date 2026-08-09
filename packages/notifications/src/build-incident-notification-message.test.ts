import { describe, expect, it } from 'vitest';

import {
  NOTIFICATION_SUBJECT_MAX_LENGTH,
  buildIncidentNotificationMessage,
} from './build-incident-notification-message.js';
import type { IncidentNotificationInput } from './incident-notification-input.js';

const baseInput: IncidentNotificationInput = {
  incidentId: 'inc-123',
  title: 'Database timeout',
  source: 'payments-api',
  severity: 'high',
  status: 'open',
  createdAt: '2026-08-09T12:00:00.000Z',
};

describe('buildIncidentNotificationMessage', () => {
  it('includes factual fields and completed analysis', () => {
    const message = buildIncidentNotificationMessage({
      ...baseInput,
      analysis: {
        summary: 'Payment queries are timing out.',
        possibleCause: 'Database connection pool exhaustion.',
        recommendedActions: [
          'Check database CPU',
          'Review recent deploys',
          'Inspect slow query log',
        ],
      },
    });

    expect(message.subject).toContain('[IncidentLens][HIGH]');
    expect(message.subject).toContain('payments-api');
    expect(message.subject.length).toBeLessThanOrEqual(
      NOTIFICATION_SUBJECT_MAX_LENGTH,
    );
    expect(message.body).toContain('inc-123');
    expect(message.body).toContain('payments-api');
    expect(message.body).toContain('HIGH');
    expect(message.body).toContain('Payment queries are timing out.');
    expect(message.body).toContain('Database connection pool exhaustion.');
    expect(message.body).toContain('1. Check database CPU');
    expect(message.body).toContain('2. Review recent deploys');
    expect(message.body).toContain('3. Inspect slow query log');
    expect(message.body).toMatch(/AI-assisted/i);
  });

  it('uses factual fallback without fabricating AI fields', () => {
    const message = buildIncidentNotificationMessage(baseInput);

    expect(message.body).toMatch(/AI analysis was unavailable/i);
    expect(message.body).toContain('inc-123');
    expect(message.body).toContain('Database timeout');
    expect(message.body).toContain('payments-api');
    expect(message.body).not.toContain('Summary:');
    expect(message.body).not.toContain('Possible cause:');
    expect(message.body).not.toContain('Recommended investigation:');
  });

  it('omits unsafe content', () => {
    const message = buildIncidentNotificationMessage(baseInput);
    const combined = `${message.subject}\n${message.body}`;
    expect(combined).not.toContain('Authorization');
    expect(combined).not.toContain('cookie');
    expect(combined).not.toContain('stack');
    expect(combined).not.toContain('awslogs');
    expect(combined).not.toContain('prompt');
  });

  it('bounds long subjects', () => {
    const message = buildIncidentNotificationMessage({
      ...baseInput,
      title: 'x'.repeat(200),
      source: 'very-long-service-name-that-keeps-going',
    });
    expect(message.subject.length).toBeLessThanOrEqual(
      NOTIFICATION_SUBJECT_MAX_LENGTH,
    );
  });
});
