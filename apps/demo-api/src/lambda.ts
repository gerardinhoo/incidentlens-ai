import awsLambdaFastify from '@fastify/aws-lambda';

import { buildApp } from './app.js';

/**
 * AWS Lambda entrypoint for the demo API.
 * Reuses buildApp() — does not duplicate Fastify initialization.
 */
const app = await buildApp();

export const handler = awsLambdaFastify(app);

// Warm the app once per execution environment (after aws-lambda decoration).
await app.ready();
