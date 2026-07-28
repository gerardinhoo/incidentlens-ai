import Fastify, { type FastifyServerOptions } from 'fastify';

import {
  MemoryIncidentRepository,
  type IncidentRepository,
} from '../../../packages/repository/src/index.js';
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
};

export async function buildApp(options: BuildAppOptions = {}) {
  const incidentRepository =
    options.incidentRepository ?? new MemoryIncidentRepository();

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
  await app.register(incidentsPlugin, { repository: incidentRepository });

  return app;
}
