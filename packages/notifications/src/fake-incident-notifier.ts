import type { IncidentNotificationInput } from './incident-notification-input.js';
import { IncidentNotificationError } from './incident-notification-error.js';
import type { IncidentNotifier } from './incident-notifier.js';

export interface FakeIncidentNotifierOptions {
  /** When set, notify() rejects with this error (no AWS calls). */
  failWith?: Error;
}

/**
 * Deterministic IncidentNotifier for tests and local composition.
 * Records call count and last allow-listed input. Makes no network calls.
 */
export class FakeIncidentNotifier implements IncidentNotifier {
  callCount = 0;
  lastInput: IncidentNotificationInput | undefined;
  readonly inputs: IncidentNotificationInput[] = [];

  constructor(private readonly options: FakeIncidentNotifierOptions = {}) {}

  notify(input: IncidentNotificationInput): Promise<void> {
    this.callCount += 1;
    this.lastInput = input;
    this.inputs.push(input);

    if (this.options.failWith !== undefined) {
      return Promise.reject(this.options.failWith);
    }
    return Promise.resolve();
  }
}

/** Convenience helper for tests that need a failing notifier. */
export function createFailingFakeIncidentNotifier(
  category = 'SNS_PUBLISH_FAILED',
): FakeIncidentNotifier {
  return new FakeIncidentNotifier({
    failWith: new IncidentNotificationError(
      category,
      'Incident notification failed',
    ),
  });
}

/**
 * Notifier that performs no delivery. Used when INCIDENT_NOTIFIER=none.
 * Callers should treat this mode as skipped rather than sent.
 */
export class NoopIncidentNotifier implements IncidentNotifier {
  notify(_unused: IncidentNotificationInput): Promise<void> {
    void _unused;
    return Promise.resolve();
  }
}
