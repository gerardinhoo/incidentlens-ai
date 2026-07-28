import Fastify, { type FastifyServerOptions } from 'fastify';

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
};

export async function buildApp(options: BuildAppOptions = {}) {
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
  await app.register(testErrorPlugin);
  await app.register(incidentsPlugin);

  return app;
}
