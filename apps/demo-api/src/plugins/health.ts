import type { FastifyPluginCallback } from 'fastify';

import { env } from '../config/env.js';
import type { HealthResponse } from '../types/health.js';

const healthPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.get<{ Reply: HealthResponse }>('/health', () => {
    return {
      status: 'ok',
      service: env.serviceName,
      version: env.serviceVersion,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  done();
};

export default healthPlugin;
