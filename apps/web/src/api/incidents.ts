import type {
  CreateIncidentInput,
  IncidentDto,
  IncidentStatus,
} from '../types/incident';
import { httpRequest, type HttpRequestOptions } from './http-client';

function withSignal(signal?: AbortSignal): Pick<HttpRequestOptions, 'signal'> {
  return signal === undefined ? {} : { signal };
}

/**
 * GET /incidents — list incidents (newest first on the server).
 */
export function getIncidents(signal?: AbortSignal): Promise<IncidentDto[]> {
  return httpRequest<IncidentDto[]>('/incidents', withSignal(signal));
}

/**
 * GET /incidents/:id — fetch a single incident by id.
 */
export function getIncidentById(
  id: string,
  signal?: AbortSignal,
): Promise<IncidentDto> {
  const encodedId = encodeURIComponent(id);
  return httpRequest<IncidentDto>(
    `/incidents/${encodedId}`,
    withSignal(signal),
  );
}

/**
 * POST /incidents — create an incident (manual / client create).
 */
export function createIncident(
  input: CreateIncidentInput,
  signal?: AbortSignal,
): Promise<IncidentDto> {
  return httpRequest<IncidentDto>('/incidents', {
    method: 'POST',
    body: input,
    ...withSignal(signal),
  });
}

/**
 * PATCH /incidents/:id/status — update lifecycle status.
 */
export function updateIncidentStatus(
  id: string,
  status: IncidentStatus,
  signal?: AbortSignal,
): Promise<IncidentDto> {
  const encodedId = encodeURIComponent(id);
  return httpRequest<IncidentDto>(`/incidents/${encodedId}/status`, {
    method: 'PATCH',
    body: { status },
    ...withSignal(signal),
  });
}
