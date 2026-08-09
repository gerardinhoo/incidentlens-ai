/**
 * Safe failure type for analysis providers.
 * Messages must not include prompts, provider bodies, credentials, or raw context.
 * Original provider errors may be attached as `cause` for internal diagnostics only.
 */
export class IncidentAnalysisError extends Error {
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
    this.name = 'IncidentAnalysisError';
    this.category = category;
  }
}
