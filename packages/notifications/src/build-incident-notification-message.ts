import type { IncidentNotificationInput } from './incident-notification-input.js';

/** SNS Publish Subject max is 100 bytes; keep a safe character bound. */
export const NOTIFICATION_SUBJECT_MAX_LENGTH = 100;

export interface IncidentNotificationMessage {
  subject: string;
  body: string;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  if (max <= 1) {
    return value.slice(0, max);
  }
  return `${value.slice(0, max - 1)}…`;
}

function severityLabel(severity: string): string {
  return severity.trim().toUpperCase();
}

/**
 * Deterministic plain-text subject + body for SNS email.
 * Does not include metadata, raw logs, prompts, or secrets.
 */
export function buildIncidentNotificationMessage(
  input: IncidentNotificationInput,
): IncidentNotificationMessage {
  const sev = severityLabel(input.severity);
  const subject = truncate(
    `[IncidentLens][${sev}] ${input.source} — ${input.title}`,
    NOTIFICATION_SUBJECT_MAX_LENGTH,
  );

  const header = [
    'IncidentLens AI detected an incident.',
    '',
    `Incident ID: ${input.incidentId}`,
    `Severity: ${sev}`,
    `Service: ${input.source}`,
    `Status: ${input.status}`,
    `Detected: ${input.createdAt}`,
    `Title: ${input.title}`,
  ];

  let body: string;
  if (input.analysis) {
    const actions = input.analysis.recommendedActions
      .map((action, index) => `${index + 1}. ${action}`)
      .join('\n');
    body = [
      ...header,
      '',
      'Summary:',
      input.analysis.summary,
      '',
      'Possible cause:',
      input.analysis.possibleCause,
      '',
      'Recommended investigation:',
      actions,
      '',
      'This analysis is AI-assisted and may represent a hypothesis rather than a confirmed root cause.',
    ].join('\n');
  } else {
    body = [
      `IncidentLens AI detected a ${sev} severity incident.`,
      '',
      'AI analysis was unavailable for this incident.',
      '',
      `Incident ID: ${input.incidentId}`,
      `Title: ${input.title}`,
      `Service: ${input.source}`,
      `Severity: ${sev}`,
      `Status: ${input.status}`,
      `Detected: ${input.createdAt}`,
    ].join('\n');
  }

  return { subject, body };
}
