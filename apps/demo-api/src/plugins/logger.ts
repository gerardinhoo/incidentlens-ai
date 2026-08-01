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

/** Max length for an accepted inbound X-Request-Id value. */
export const MAX_REQUEST_ID_LENGTH = 128;

/**
 * Safe inbound request IDs: letters, digits, `.`, `_`, `-` only.
 * Rejects oversized or opaque values so client-supplied IDs cannot become log-injection vectors.
 */
export const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Returns true when a client-supplied request ID is safe to adopt as Fastify request.id.
 */
export function isSafeRequestId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_REQUEST_ID_LENGTH &&
    SAFE_REQUEST_ID_PATTERN.test(value)
  );
}

/**
 * Resolves the application request ID from an inbound X-Request-Id header.
 * Unsafe or missing values are replaced with a generated UUID.
 *
 * Note: API Gateway `$context.requestId` is a separate edge identifier unless
 * the client (or a future middleware) explicitly forwards a shared correlation header.
 */
export function resolveIncomingRequestId(
  headerValue: string | string[] | undefined,
): string {
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (typeof candidate === 'string' && isSafeRequestId(candidate)) {
    return candidate;
  }

  return randomUUID();
}

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
    genReqId: (req: RawRequestDefaultExpression<RawServerDefault>): string =>
      resolveIncomingRequestId(req.headers['x-request-id']),
  };
}

const loggerPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.addHook('onRequest', (request, reply, hookDone) => {
    void reply.header('x-request-id', request.id);
    hookDone();
  });

  fastify.setErrorHandler((error, request, reply) => {
    const err =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'Unknown error');

    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;

    request.log.error(
      {
        err: {
          type: err.name,
          message: err.message,
        },
        method: request.method,
        url: request.url,
        statusCode,
        requestId: request.id,
      },
      'request failed',
    );
    void reply.send(error);
  });

  done();
};

export default fp(loggerPlugin, {
  name: 'logger',
});
