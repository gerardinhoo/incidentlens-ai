/**
 * Safe failure type for notification providers.
 * Messages must not include email bodies, credentials, or raw SNS responses.
 */
export class IncidentNotificationError extends Error {
  readonly category: string;

  constructor(
    category: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(
      message,
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = 'IncidentNotificationError';
    this.category = category;
  }
}
