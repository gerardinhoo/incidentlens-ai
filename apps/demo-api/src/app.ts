import Fastify, { type FastifyServerOptions } from 'fastify';

import type { IncidentRepository } from '../../../packages/repository/src/index.js';
import { createConfiguredIncidentRepository } from './config/incident-repository.js';
import { env } from './config/env.js';
import corsPreflightPlugin from './plugins/cors-preflight.js';
import {
  createTokenBucketLimiter,
  type TokenBucketLimiter,
} from './rate-limit/token-bucket.js';
import healthPlugin from './plugins/health.js';
import incidentsPlugin from './plugins/incidents.js';
import loggerPlugin, {
  buildLoggerOptions,
  buildRequestIdOptions,
} from './plugins/logger.js';
import testErrorPlugin from './plugins/test-error.js';
import { createIncidentAjvOptions } from './schemas/create-incident.js';

export type BuildAppOptions = {
  logger?: FastifyServerOptions['logger'];
  incidentRepository?: IncidentRepository;
  /**
   * Override ENABLE_TEST_ERROR_ENDPOINT for tests.
   * When omitted, uses env.enableTestErrorEndpoint (default false).
   */
  enableTestErrorEndpoint?: boolean;
  /** Override POST /incidents limiter. `false` disables (unit tests). */
  postIncidentsRateLimit?: TokenBucketLimiter | false;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const incidentRepository =
    options.incidentRepository ?? createConfiguredIncidentRepository();
  const enableTestErrorEndpoint =
    options.enableTestErrorEndpoint ?? env.enableTestErrorEndpoint;

  const postIncidentsRateLimit =
    options.postIncidentsRateLimit === false
      ? undefined
      : (options.postIncidentsRateLimit ??
        createTokenBucketLimiter({
          capacity: env.postIncidentsRateCapacity,
          refillPerMinute: env.postIncidentsRateRefillPerMinute,
        }));

  const app = Fastify({
    logger: options.logger ?? buildLoggerOptions(),
    trustProxy: true,
    ...buildRequestIdOptions(),
    ajv: {
      customOptions: {
        ...createIncidentAjvOptions,
      },
    },
  });

  await app.register(loggerPlugin);
  await app.register(corsPreflightPlugin);
  await app.register(healthPlugin);
  if (enableTestErrorEndpoint) {
    await app.register(testErrorPlugin);
  }
  if (postIncidentsRateLimit === undefined) {
    await app.register(incidentsPlugin, { repository: incidentRepository });
  } else {
    await app.register(incidentsPlugin, {
      repository: incidentRepository,
      postIncidentsRateLimit,
    });
  }

  return app;
}
