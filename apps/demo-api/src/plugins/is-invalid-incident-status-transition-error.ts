/**
 * Detects domain errors thrown for disallowed incident status transitions.
 */
export function isInvalidIncidentStatusTransitionError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith('Invalid incident status transition')
  );
}
