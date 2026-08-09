/**
 * Safe failure type for analysis providers.
 * Messages must not include prompts, provider bodies, credentials, or raw context.
 */
export class IncidentAnalysisError extends Error {
  readonly category: string;

  constructor(category: string, message: string) {
    super(message);
    this.name = 'IncidentAnalysisError';
    this.category = category;
  }
}
