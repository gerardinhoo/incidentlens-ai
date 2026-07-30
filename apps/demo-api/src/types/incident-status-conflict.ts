/**
 * Safe 409 body for rejected incident status transitions.
 * Kept at the API boundary — does not expose domain error details.
 */
export interface IncidentStatusConflictResponse {
  status: 'error';
  message: 'Invalid incident status transition';
}
