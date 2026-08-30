import Fastify, { type FastifyServerOptions } from 'fastify';

import type { IncidentRepository } from '../../../packages/repository/src/index.js';
import { createConfiguredIncidentRepository } from './config/incident-repository.js';
import { env } from './config/env.js';
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
};

export async function buildApp(options: BuildAppOptions = {}) {
  const incidentRepository =
    options.incidentRepository ?? createConfiguredIncidentRepository();
  const enableTestErrorEndpoint =
    options.enableTestErrorEndpoint ?? env.enableTestErrorEndpoint;

  const app = Fastify({
    logger: options.logger ?? buildLoggerOptions(),
    ...buildRequestIdOptions(),
    ajv: {
      customOptions: {
        ...createIncidentAjvOptions,
      },
    },
  });

  await app.register(loggerPlugin);
  await app.register(healthPlugin);
  if (enableTestErrorEndpoint) {
    await app.register(testErrorPlugin);
  }
  await app.register(incidentsPlugin, { repository: incidentRepository });

  return app;
}
