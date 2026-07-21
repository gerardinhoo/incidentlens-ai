import Fastify from 'fastify';

import healthPlugin from './plugins/health.js';

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(healthPlugin);

  return app;
}
