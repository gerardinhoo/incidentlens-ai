import { describe, expect, it } from 'vitest';

import { parseLogRecord } from '../src/cloudwatch/parse-log-record.js';
import { MAX_CANDIDATE_MSG_LENGTH } from '../src/cloudwatch/types.js';
import {
  candidatePinoMessage,
  infoPinoMessage,
} from './helpers/cloudwatch-fixtures.js';

const LOG_GROUP = '/aws/lambda/incidentlens-dev-api';
const LOG_STREAM = 'stream-1';

describe('parseLogRecord', () => {
  it('parses a valid incident-candidate into a normalized candidate', () => {
    const result = parseLogRecord(
      {
        id: 'evt-abc',
        timestamp: 1_700_000_000_123,
        message: candidatePinoMessage({ requestId: 'req-42' }),
      },
      LOG_GROUP,
      LOG_STREAM,
    );

    expect(result.outcome).toBe('candidate');
    if (result.outcome !== 'candidate') {
      return;
    }
    expect(result.candidate.sourceEventId).toBe('evt-abc');
    expect(result.candidate.timestamp).toBe(1_700_000_000_123);
    expect(result.candidate.logGroup).toBe(LOG_GROUP);
    expect(result.candidate.logStream).toBe(LOG_STREAM);
    expect(result.candidate.eventType).toBe('incident_candidate');
    expect(result.candidate.requestId).toBe('req-42');
    expect(result.candidate.severity).toBe('error');
    expect(result.candidate.statusCode).toBe(500);
    expect(result.candidate.route).toBe('/test-error');
    expect(result.candidate.service).toBe('incidentlens-demo-api');
  });

  it('drops arbitrary, nested, and sensitive fields', () => {
    const result = parseLogRecord(
      {
        id: 'evt-1',
        timestamp: 1,
        message: candidatePinoMessage({
          authorization: 'Bearer secret',
          headers: { cookie: 'a=b' },
          stack: 'Error: boom\n at x',
          description: 'secret description',
          metadata: { nested: true },
          body: { password: 'x' },
        }),
      },
      LOG_GROUP,
      LOG_STREAM,
    );

    expect(result.outcome).toBe('candidate');
    if (result.outcome !== 'candidate') {
      return;
    }
    const keys = Object.keys(result.candidate);
    expect(keys).not.toContain('authorization');
    expect(keys).not.toContain('headers');
    expect(keys).not.toContain('stack');
    expect(keys).not.toContain('description');
    expect(keys).not.toContain('metadata');
    expect(keys).not.toContain('body');
    expect(JSON.stringify(result.candidate)).not.toContain('Bearer secret');
    expect(JSON.stringify(result.candidate)).not.toContain('password');
  });

  it('ignores normal info JSON logs', () => {
    const result = parseLogRecord(
      { id: 'evt-2', timestamp: 1, message: infoPinoMessage() },
      LOG_GROUP,
      LOG_STREAM,
    );
    expect(result).toEqual({
      outcome: 'ignored',
      reason: 'non_candidate_event_type',
    });
  });

  it('ignores plain-text messages', () => {
    const result = parseLogRecord(
      { id: 'evt-3', timestamp: 1, message: 'START RequestId: abc' },
      LOG_GROUP,
      LOG_STREAM,
    );
    expect(result.outcome).toBe('ignored');
    expect(result).toMatchObject({ reason: 'non_json_message' });
  });

  it('marks malformed JSON as failed without throwing', () => {
    const result = parseLogRecord(
      { id: 'evt-4', timestamp: 1, message: '{not-json' },
      LOG_GROUP,
      LOG_STREAM,
    );
    expect(result).toEqual({ outcome: 'failed', reason: 'malformed_json' });
  });

  it('ignores wrong eventType', () => {
    const result = parseLogRecord(
      {
        id: 'evt-5',
        timestamp: 1,
        message: JSON.stringify({ eventType: 'other', severity: 'error' }),
      },
      LOG_GROUP,
      LOG_STREAM,
    );
    expect(result.outcome).toBe('ignored');
  });

  it('omits invalid optional field types', () => {
    const result = parseLogRecord(
      {
        id: 'evt-6',
        timestamp: 1,
        message: candidatePinoMessage({
          statusCode: '500',
          severity: 'not-a-level',
          requestId: 123,
        }),
      },
      LOG_GROUP,
      LOG_STREAM,
    );
    expect(result.outcome).toBe('candidate');
    if (result.outcome !== 'candidate') {
      return;
    }
    expect(result.candidate.statusCode).toBeUndefined();
    expect(result.candidate.severity).toBeUndefined();
    expect(result.candidate.requestId).toBeUndefined();
  });

  it('truncates oversized optional msg', () => {
    const long = 'x'.repeat(MAX_CANDIDATE_MSG_LENGTH + 50);
    const result = parseLogRecord(
      {
        id: 'evt-7',
        timestamp: 1,
        message: candidatePinoMessage({ msg: long }),
      },
      LOG_GROUP,
      LOG_STREAM,
    );
    expect(result.outcome).toBe('candidate');
    if (result.outcome !== 'candidate') {
      return;
    }
    expect(result.candidate.msg?.length).toBe(MAX_CANDIDATE_MSG_LENGTH);
  });
});
