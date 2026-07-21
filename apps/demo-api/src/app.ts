import Fastify, { type FastifyServerOptions } from 'fastify';

import healthPlugin from './plugins/health.js';
import loggerPlugin, {
  buildLoggerOptions,
  buildRequestIdOptions,
} from './plugins/logger.js';

export type BuildAppOptions = {
  logger?: FastifyServerOptions['logger'];
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? buildLoggerOptions(),
    ...buildRequestIdOptions(),
  });

  await app.register(loggerPlugin);
  await app.register(healthPlugin);

  return app;
}
