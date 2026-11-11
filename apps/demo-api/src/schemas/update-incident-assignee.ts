import type { FastifySchema } from 'fastify';

import { getIncidentParamsSchema } from './get-incident-by-id.js';

/**
 * PATCH /incidents/:id/assignee takes identity from Authorization, not the body.
 */
export const updateIncidentAssigneeBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

export const updateIncidentAssigneeSchema = {
  params: getIncidentParamsSchema,
  body: updateIncidentAssigneeBodySchema,
} satisfies FastifySchema;
