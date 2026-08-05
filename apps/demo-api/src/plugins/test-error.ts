import type { FastifyPluginCallback } from 'fastify';

import { env } from '../config/env.js';
import type { TestErrorResponse } from '../types/test-error.js';

/**
 * Controlled failure used to emit a deliberate incident-candidate log for the
 * CloudWatch Logs → processor subscription pipeline (SCRUM-32).
 *
 * Subscription filter contract: `{ $.eventType = "incident_candidate" }`
 */
const testErrorPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.get<{ Reply: TestErrorResponse }>(
    '/test-error',
    async (request, reply) => {
      const error = new Error('Controlled test failure');

      // Safe fields only — no request body, auth headers, metadata, or stack.
      request.log.error(
        {
          eventType: 'incident_candidate',
          severity: 'error',
          requestId: request.id,
          route: '/test-error',
          url: request.url,
          statusCode: 500,
          errorType: error.name,
          errorName: error.name,
          service: env.serviceName,
          environment: process.env.NODE_ENV ?? 'development',
        },
        'controlled test failure',
      );

      void reply.status(500);

      return {
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Controlled test failure',
        requestId: request.id,
      };
    },
  );

  done();
};

export default testErrorPlugin;
