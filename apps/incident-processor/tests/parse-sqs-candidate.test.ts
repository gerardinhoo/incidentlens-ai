import { describe, expect, it } from 'vitest';

import {
  parseSqsCandidateBody,
  SqsCandidateParseError,
} from '../src/sqs/parse-sqs-candidate.js';
import { sampleCandidate } from './helpers/sqs-fixtures.js';

describe('parseSqsCandidateBody', () => {
  it('accepts a JSON incident_candidate', () => {
    const candidate = sampleCandidate();
    expect(parseSqsCandidateBody(JSON.stringify(candidate))).toEqual(candidate);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseSqsCandidateBody('{')).toThrow(SqsCandidateParseError);
  });

  it('rejects bodies without eventType', () => {
    expect(() => parseSqsCandidateBody('{"sourceEventId":"1"}')).toThrow(
      /eventType/,
    );
  });
});
