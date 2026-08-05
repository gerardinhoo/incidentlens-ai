import { gzipSync } from 'node:zlib';

import type { CloudWatchDecodedPayload } from '../../src/cloudwatch/types.js';

/**
 * Build a Lambda CloudWatch Logs envelope from a decoded payload fixture.
 */
export function encodeCloudWatchEnvelope(payload: CloudWatchDecodedPayload): {
  awslogs: { data: string };
} {
  const json = JSON.stringify(payload);
  const compressed = gzipSync(Buffer.from(json, 'utf8'));
  return {
    awslogs: {
      data: compressed.toString('base64'),
    },
  };
}

export function candidatePinoMessage(
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    level: 50,
    time: Date.now(),
    eventType: 'incident_candidate',
    severity: 'error',
    requestId: 'req-fixture-1',
    route: '/test-error',
    url: '/test-error',
    statusCode: 500,
    errorType: 'Error',
    errorName: 'Error',
    service: 'incidentlens-demo-api',
    environment: 'test',
    msg: 'controlled test failure',
    ...overrides,
  });
}

export function infoPinoMessage(): string {
  return JSON.stringify({
    level: 30,
    time: Date.now(),
    service: 'incidentlens-demo-api',
    msg: 'request completed',
  });
}

export function baseDataPayload(
  logEvents: Array<{ id: string; timestamp: number; message: string }>,
): CloudWatchDecodedPayload {
  return {
    owner: '123456789012',
    logGroup: '/aws/lambda/incidentlens-dev-api',
    logStream: '2026/08/05/[$LATEST]abcd',
    subscriptionFilters: ['incidentlens-dev-api-incident-candidate'],
    messageType: 'DATA_MESSAGE',
    logEvents,
  };
}

export function controlPayload(): CloudWatchDecodedPayload {
  return {
    owner: '123456789012',
    logGroup: '/aws/lambda/incidentlens-dev-api',
    logStream: '2026/08/05/[$LATEST]control',
    subscriptionFilters: ['incidentlens-dev-api-incident-candidate'],
    messageType: 'CONTROL_MESSAGE',
    logEvents: [],
  };
}
