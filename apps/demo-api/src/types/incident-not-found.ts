/**
 * Safe 404 body for missing incidents.
 * Kept at the API boundary — does not expose repository details.
 */
export interface IncidentNotFoundResponse {
  status: 'error';
  message: 'Incident not found';
}
