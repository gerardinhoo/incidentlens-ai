import type { FastifyPluginCallback } from 'fastify';

import type { TestErrorResponse } from '../types/test-error.js';

const testErrorPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.get<{ Reply: TestErrorResponse }>(
    '/test-error',
    async (request, reply) => {
      const error = new Error('Controlled test failure');

      request.log.error({ err: error }, 'controlled test failure');

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
