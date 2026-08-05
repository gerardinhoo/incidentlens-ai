import { Writable } from 'node:stream';

import { afterAll, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import { env } from './config/env.js';
import type { HealthResponse } from './types/health.js';
import type { TestErrorResponse } from './types/test-error.js';

describe('demo-api', () => {
  describe('GET /health', () => {
    const appPromise = buildApp({ logger: false });

    afterAll(async () => {
      const app = await appPromise;
      await app.close();
    });

    it('returns HTTP 200 with the expected health payload', async () => {
      const app = await appPromise;
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.headers['x-request-id']).toBeTruthy();

      const body = response.json<HealthResponse>();

      expect(Object.keys(body).sort()).toEqual(
        ['service', 'status', 'timestamp', 'uptime', 'version'].sort(),
      );
      expect(body.status).toBe('ok');
      expect(body.service).toBe(env.serviceName);
      expect(body.version).toBe(env.serviceVersion);
      expect(body.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
      expect(typeof body.uptime).toBe('number');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('reuses an incoming x-request-id header', async () => {
      const app = await appPromise;
      const requestId = 'incident-test-request-id';

      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'x-request-id': requestId,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-request-id']).toBe(requestId);
    });
  });

  describe('GET /test-error', () => {
    const logLines: Array<Record<string, unknown>> = [];

    const appPromise = buildApp({
      logger: {
        level: 'error',
        stream: new Writable({
          write(chunk: string | Buffer, _encoding, callback) {
            const line =
              typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            logLines.push(JSON.parse(line) as Record<string, unknown>);
            callback();
          },
        }),
      },
    });

    afterAll(async () => {
      const app = await appPromise;
      await app.close();
    });

    it('returns HTTP 500 with a safe JSON body and logs the error', async () => {
      const app = await appPromise;
      const requestId = 'controlled-failure-request-id';
      logLines.length = 0;

      const response = await app.inject({
        method: 'GET',
        url: '/test-error',
        headers: {
          'x-request-id': requestId,
        },
      });

      expect(response.statusCode).toBe(500);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.headers['x-request-id']).toBe(requestId);

      const body = response.json<TestErrorResponse>();

      expect(body).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Controlled test failure',
        requestId,
      });
      expect(body).not.toHaveProperty('stack');
      expect(JSON.stringify(body)).not.toMatch(/stack/i);

      const errorLog = logLines.find(
        (line) => line.msg === 'controlled test failure',
      );

      expect(errorLog).toBeDefined();
      expect(errorLog?.eventType).toBe('incident_candidate');
      expect(errorLog?.severity).toBe('error');
      expect(errorLog?.requestId).toBe(requestId);
      expect(errorLog?.route).toBe('/test-error');
      expect(errorLog?.statusCode).toBe(500);
      expect(errorLog?.errorType).toBe('Error');
      expect(errorLog?.errorName).toBe('Error');
      expect(errorLog?.service).toBe(env.serviceName);
      expect(errorLog?.environment).toBeTruthy();
      // Must not log request body, arbitrary metadata, or stack traces.
      expect(errorLog).not.toHaveProperty('body');
      expect(errorLog).not.toHaveProperty('metadata');
      expect(errorLog).not.toHaveProperty('err');
      expect(JSON.stringify(errorLog)).not.toMatch(/stack/i);
    });
  });

  describe('unknown routes', () => {
    const appPromise = buildApp({ logger: false });

    afterAll(async () => {
      const app = await appPromise;
      await app.close();
    });

    it('returns HTTP 404 for an unknown route', async () => {
      const app = await appPromise;
      const requestId = 'unknown-route-request-id';

      const response = await app.inject({
        method: 'GET',
        url: '/does-not-exist',
        headers: {
          'x-request-id': requestId,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.headers['x-request-id']).toBe(requestId);

      const body = response.json<{
        statusCode: number;
        error: string;
        message: string;
      }>();

      expect(body.statusCode).toBe(404);
      expect(body.error).toBe('Not Found');
      expect(body.message).toMatch(/not found/i);
      expect(body).not.toHaveProperty('stack');
    });
  });
});
