import { randomUUID } from 'node:crypto';

import {
  LogController,
  type FastifyPluginCallback,
  type FastifyServerOptions,
  type RawRequestDefaultExpression,
  type RawServerDefault,
} from 'fastify';
import fp from 'fastify-plugin';

import { env } from '../config/env.js';

export function buildLoggerOptions(): Exclude<
  FastifyServerOptions['logger'],
  boolean | undefined
> {
  return {
    level: env.logLevel,
    base: {
      service: env.serviceName,
      version: env.serviceVersion,
    },
  };
}

export function buildRequestIdOptions(): Pick<
  FastifyServerOptions,
  'requestIdHeader' | 'genReqId' | 'logController'
> {
  return {
    requestIdHeader: 'x-request-id',
    logController: new LogController({
      requestIdLogLabel: 'requestId',
    }),
    genReqId: (req: RawRequestDefaultExpression<RawServerDefault>): string => {
      const headerValue = req.headers['x-request-id'];

      if (typeof headerValue === 'string' && headerValue.length > 0) {
        return headerValue;
      }

      if (Array.isArray(headerValue) && headerValue[0]) {
        return headerValue[0];
      }

      return randomUUID();
    },
  };
}

const loggerPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.addHook('onRequest', (request, reply, hookDone) => {
    void reply.header('x-request-id', request.id);
    hookDone();
  });

  fastify.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'request failed');
    void reply.send(error);
  });

  done();
};

export default fp(loggerPlugin, {
  name: 'logger',
});
