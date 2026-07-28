import type { FastifySchema } from 'fastify';

import { INCIDENT_SEVERITIES } from '../../../../packages/domain/src/index.js';

/**
 * Ajv options required for this schema to reject unknown fields and
 * non-string metadata values (instead of stripping/coercing them).
 * Reuse when registering POST /incidents.
 */
export const createIncidentAjvOptions = {
  coerceTypes: false,
  removeAdditional: false,
} as const;

/**
 * Fastify JSON Schema for CreateIncidentInput request bodies.
 * Kept at the API boundary — not in the domain package.
 */
export const createIncidentBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'source', 'severity', 'errorType'],
  properties: {
    title: {
      type: 'string',
      minLength: 3,
      maxLength: 200,
    },
    description: {
      type: 'string',
      maxLength: 5000,
    },
    source: {
      type: 'string',
      minLength: 1,
      maxLength: 150,
    },
    severity: {
      type: 'string',
      enum: [...INCIDENT_SEVERITIES],
    },
    errorType: {
      type: 'string',
      minLength: 1,
      maxLength: 150,
    },
    requestId: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
    },
    metadata: {
      type: 'object',
      additionalProperties: {
        type: 'string',
      },
    },
  },
} as const;

/**
 * Route schema fragment reusable by POST /incidents.
 */
export const createIncidentSchema = {
  body: createIncidentBodySchema,
} satisfies FastifySchema;
