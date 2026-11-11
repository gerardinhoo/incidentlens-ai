import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

/**
 * API Gateway HTTP API JWT on $default 401s browser OPTIONS.
 * Public OPTIONS routes proxy here; Fastify must return 2xx so preflight succeeds.
 * CORS allow-origin headers are added by API Gateway, not this handler.
 */
const corsPreflightPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  const noContent = async (_request: unknown, reply: FastifyReply) =>
    reply.code(204).send();

  // Explicit routes so Fastify does not 404 OPTIONS before hooks in Lambda.
  fastify.options('/incidents', noContent);
  fastify.options('/incidents/:id', noContent);
  fastify.options('/incidents/:id/status', noContent);
  fastify.options('/incidents/:id/assignee', noContent);

  fastify.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'OPTIONS') {
      return;
    }

    return reply.code(204).send();
  });

  done();
};

export default fp(corsPreflightPlugin, {
  name: 'cors-preflight',
});
