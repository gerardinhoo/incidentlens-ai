import type { SQSEvent, SQSRecord } from 'aws-lambda';

import type { ParsedIncidentCandidate } from '../../src/cloudwatch/types.js';

export function sampleCandidate(
  overrides: Partial<ParsedIncidentCandidate> = {},
): ParsedIncidentCandidate {
  return {
    sourceEventId: '1',
    timestamp: 1,
    logGroup: '/aws/lambda/incidentlens-dev-api',
    logStream: '2026/08/05/[$LATEST]abcd',
    eventType: 'incident_candidate',
    requestId: 'req-fixture-1',
    service: 'incidentlens-demo-api',
    environment: 'test',
    severity: 'error',
    errorType: 'Error',
    errorName: 'Error',
    statusCode: 500,
    route: '/test-error',
    url: '/test-error',
    msg: 'controlled test failure',
    ...overrides,
  };
}

export function sqsEventFromCandidates(
  candidates: ParsedIncidentCandidate[],
): SQSEvent {
  return {
    Records: candidates.map((candidate, index) =>
      sqsRecordFromBody(JSON.stringify(candidate), index),
    ),
  };
}

export function sqsEventFromBodies(bodies: string[]): SQSEvent {
  return {
    Records: bodies.map((body, index) => sqsRecordFromBody(body, index)),
  };
}

export function sqsRecordFromBody(body: string, index: number): SQSRecord {
  return {
    messageId: `msg-${index}`,
    receiptHandle: `rh-${index}`,
    body,
    attributes: {
      ApproximateReceiveCount: '1',
      SentTimestamp: '1',
      SenderId: 'test',
      ApproximateFirstReceiveTimestamp: '1',
    },
    messageAttributes: {},
    md5OfBody: '',
    eventSource: 'aws:sqs',
    eventSourceARN:
      'arn:aws:sqs:us-east-1:123456789012:incidentlens-dev-incident-candidates',
    awsRegion: 'us-east-1',
  };
}
