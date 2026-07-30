import type { FastifySchema } from 'fastify';

/**
 * Fastify JSON Schema for GET /incidents/:id path params.
 * Does not require UUID format so future non-UUID ids remain valid.
 */
export const getIncidentParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: {
      type: 'string',
      minLength: 1,
    },
  },
} as const;

/**
 * Route schema fragment reusable by GET /incidents/:id.
 */
export const getIncidentByIdSchema = {
  params: getIncidentParamsSchema,
} satisfies FastifySchema;
