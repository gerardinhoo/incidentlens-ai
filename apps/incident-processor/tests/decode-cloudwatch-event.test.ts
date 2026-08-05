import { describe, expect, it } from 'vitest';

import {
  decodeCloudWatchEvent,
  validateCloudWatchPayload,
} from '../src/cloudwatch/decode-cloudwatch-event.js';
import { CloudWatchTransportError } from '../src/cloudwatch/types.js';
import {
  baseDataPayload,
  candidatePinoMessage,
  controlPayload,
  encodeCloudWatchEnvelope,
} from './helpers/cloudwatch-fixtures.js';

describe('decodeCloudWatchEvent', () => {
  it('decodes a valid Base64 + gzip DATA_MESSAGE payload', async () => {
    const payload = baseDataPayload([
      {
        id: 'evt-1',
        timestamp: 1_700_000_000_000,
        message: candidatePinoMessage(),
      },
    ]);
    const envelope = encodeCloudWatchEnvelope(payload);
    const decoded = await decodeCloudWatchEvent(envelope);

    expect(decoded.messageType).toBe('DATA_MESSAGE');
    expect(decoded.logGroup).toBe('/aws/lambda/incidentlens-dev-api');
    expect(decoded.logStream).toBe(payload.logStream);
    expect(decoded.owner).toBe('123456789012');
    expect(decoded.logEvents).toHaveLength(1);
    expect(decoded.logEvents[0]?.id).toBe('evt-1');
  });

  it('accepts CONTROL_MESSAGE with no logEvents', async () => {
    const decoded = await decodeCloudWatchEvent(
      encodeCloudWatchEnvelope(controlPayload()),
    );
    expect(decoded.messageType).toBe('CONTROL_MESSAGE');
    expect(decoded.logEvents).toEqual([]);
  });

  it('fails when awslogs.data is missing', async () => {
    await expect(decodeCloudWatchEvent({})).rejects.toBeInstanceOf(
      CloudWatchTransportError,
    );
    await expect(decodeCloudWatchEvent({})).rejects.toMatchObject({
      category: 'missing_awslogs_data',
    });
  });

  it('fails when awslogs.data is empty', async () => {
    await expect(
      decodeCloudWatchEvent({ awslogs: { data: '' } }),
    ).rejects.toMatchObject({ category: 'empty_data' });
  });

  it('fails on invalid Base64 characters', async () => {
    await expect(
      decodeCloudWatchEvent({ awslogs: { data: '!!!not-base64!!!' } }),
    ).rejects.toMatchObject({ category: 'invalid_base64' });
  });

  it('fails when Base64 is not gzip data', async () => {
    const notGzip = Buffer.from('hello world', 'utf8').toString('base64');
    await expect(
      decodeCloudWatchEvent({ awslogs: { data: notGzip } }),
    ).rejects.toMatchObject({ category: 'gzip_failed' });
  });

  it('fails when decompressed content is not JSON', async () => {
    const { gzipSync } = await import('node:zlib');
    const data = gzipSync(Buffer.from('not-json', 'utf8')).toString('base64');
    await expect(
      decodeCloudWatchEvent({ awslogs: { data } }),
    ).rejects.toMatchObject({ category: 'json_parse_failed' });
  });

  it('fails on unsupported messageType', () => {
    expect(() =>
      validateCloudWatchPayload({
        owner: '123',
        logGroup: '/aws/lambda/x',
        logStream: 's',
        subscriptionFilters: [],
        messageType: 'OTHER',
        logEvents: [],
      }),
    ).toThrow(CloudWatchTransportError);
  });

  it('fails when DATA_MESSAGE logEvents is invalid', () => {
    expect(() =>
      validateCloudWatchPayload({
        owner: '123',
        logGroup: '/aws/lambda/x',
        logStream: 's',
        subscriptionFilters: [],
        messageType: 'DATA_MESSAGE',
        logEvents: [{ id: '', timestamp: 1, message: 'x' }],
      }),
    ).toThrow(/logEvents\[0\]\.id/);
  });

  it('fails on invalid payload shape', () => {
    expect(() => validateCloudWatchPayload(null)).toThrow(
      CloudWatchTransportError,
    );
    expect(() => validateCloudWatchPayload({ owner: 'x' })).toThrow(
      CloudWatchTransportError,
    );
  });
});
