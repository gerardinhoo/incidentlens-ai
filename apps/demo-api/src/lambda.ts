import awsLambdaFastify from '@fastify/aws-lambda';

import { buildApp } from './app.js';

/**
 * AWS Lambda entrypoint for the demo API.
 * Reuses buildApp() — does not duplicate Fastify initialization.
 *
 * Compatible with API Gateway HTTP API payload format version 2.0
 * (@fastify/aws-lambda reads event.version === "2.0").
 * Local HTTP listening remains in server.ts only.
 */
const app = await buildApp();

export const handler = awsLambdaFastify(app);

// Warm the app once per execution environment (after aws-lambda decoration).
await app.ready();
