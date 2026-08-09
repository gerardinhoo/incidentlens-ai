import type { IncidentNotificationInput } from './incident-notification-input.js';

/**
 * Provider-independent outbound incident notifier.
 * Implementations must not throw transport/provider details into logs.
 */
export interface IncidentNotifier {
  notify(input: IncidentNotificationInput): Promise<void>;
}
