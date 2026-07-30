import type { FastifySchema } from 'fastify';

import { INCIDENT_STATUSES } from '../../../../packages/domain/src/index.js';
import { getIncidentParamsSchema } from './get-incident-by-id.js';

/**
 * Request body for PATCH /incidents/:id/status.
 */
export type UpdateIncidentStatusBody = {
  status: (typeof INCIDENT_STATUSES)[number];
};

/**
 * Fastify JSON Schema for the status update body.
 * Reuses domain status values; rejects unknown fields.
 */
export const updateIncidentStatusBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: {
      type: 'string',
      enum: [...INCIDENT_STATUSES],
    },
  },
} as const;

/**
 * Route schema for PATCH /incidents/:id/status.
 * Reuses the shared incident id params schema.
 */
export const updateIncidentStatusSchema = {
  params: getIncidentParamsSchema,
  body: updateIncidentStatusBodySchema,
} satisfies FastifySchema;
