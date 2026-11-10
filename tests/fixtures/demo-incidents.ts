import type { Incident } from '../../packages/domain/src/index.js';

/**
 * Stable mixed demo rows for screenshots and operator walkthroughs (US-037).
 * Direct Dynamo writes — do not run Bedrock. No emails or personal data.
 */
export const DEMO_INCIDENTS: readonly Incident[] = [
  {
    id: 'demo-checkout-timeouts',
    title: 'Checkout API p95 latency exceeded 8s',
    description:
      'Place-order requests are timing out at the edge. Cart can load; payment authorization hangs.',
    source: 'checkout-api',
    severity: 'critical',
    status: 'open',
    errorType: 'TimeoutError',
    requestId: 'req-chk-88421',
    metadata: {
      environment: 'production',
      region: 'us-east-1',
      httpStatus: '504',
    },
    analysis: {
      status: 'completed',
      summary:
        'Checkout authorization calls to payments-api are waiting until the client timeout.',
      possibleCause:
        'payments-api connection pool saturation after a deploy increased checkout concurrency.',
      recommendedActions: [
        'Compare checkout and payments-api latency around the last deploy.',
        'Inspect payments-api connection pool and downstream RDS wait events.',
        'Enable a short circuit breaker on checkout→payments if saturation persists.',
      ],
      analyzedAt: '2026-11-04T18:12:00.000Z',
    },
    createdAt: '2026-11-04T18:05:00.000Z',
    updatedAt: '2026-11-04T18:12:00.000Z',
  },
  {
    id: 'demo-auth-latency',
    title: 'Auth token exchange p99 above SLO',
    description:
      'Login and token refresh are slow during US morning peak. Sessions still succeed.',
    source: 'auth-service',
    severity: 'high',
    status: 'investigating',
    errorType: 'HighLatency',
    requestId: 'req-auth-55102',
    metadata: {
      environment: 'production',
      region: 'us-east-1',
    },
    analysis: {
      status: 'completed',
      summary:
        'Token exchange latency tracks the identity provider, not auth-service CPU.',
      possibleCause:
        'Upstream IdP regional degradation; auth-service retries amplify tail latency.',
      recommendedActions: [
        'Check IdP status and regional error rates.',
        'Review retry/backoff on the token-exchange client.',
        'Confirm whether cache TTL for refresh tokens was reduced recently.',
      ],
      analyzedAt: '2026-11-04T16:40:00.000Z',
    },
    createdAt: '2026-11-04T15:20:00.000Z',
    updatedAt: '2026-11-04T16:40:00.000Z',
  },
  {
    id: 'demo-payments-5xx',
    title: 'Payments API returning 502 on authorize',
    description:
      'Intermittent 502s on /authorize. Captures later in the same session often succeed.',
    source: 'payments-api',
    severity: 'high',
    status: 'open',
    errorType: 'BadGateway',
    requestId: 'req-pay-22019',
    metadata: {
      environment: 'production',
      region: 'us-east-1',
      httpStatus: '502',
    },
    analysis: {
      status: 'pending',
    },
    createdAt: '2026-11-04T19:01:00.000Z',
    updatedAt: '2026-11-04T19:01:00.000Z',
  },
  {
    id: 'demo-inventory-lag',
    title: 'Inventory worker lag exceeded 15 minutes',
    description:
      'Stock updates from the warehouse feed were delayed; storefront counts caught up after replay.',
    source: 'inventory-worker',
    severity: 'medium',
    status: 'resolved',
    errorType: 'ProcessingDelay',
    requestId: 'req-inv-1044',
    metadata: {
      environment: 'production',
      region: 'us-east-1',
    },
    analysis: {
      status: 'completed',
      summary:
        'The warehouse SQS consumer stalled on a poison message, then recovered after a redeploy.',
      possibleCause:
        'An unexpected payload field caused the worker to throw before delete.',
      recommendedActions: [
        'Confirm the poison message is on the DLQ and captured.',
        'Add schema validation before the inventory write.',
        'Keep reserved concurrency low until the parser is patched.',
      ],
      analyzedAt: '2026-11-03T22:10:00.000Z',
    },
    createdAt: '2026-11-03T21:05:00.000Z',
    updatedAt: '2026-11-03T22:18:00.000Z',
  },
  {
    id: 'demo-search-failed-analysis',
    title: 'Search cluster yellow after replica drop',
    description:
      'Product search still serves results; one replica left the cluster during a rolling restart.',
    source: 'search-api',
    severity: 'low',
    status: 'open',
    errorType: 'ClusterDegraded',
    requestId: 'req-srch-77',
    metadata: {
      environment: 'staging',
      region: 'us-east-1',
    },
    analysis: {
      status: 'failed',
      analyzedAt: '2026-11-04T12:08:00.000Z',
    },
    createdAt: '2026-11-04T12:02:00.000Z',
    updatedAt: '2026-11-04T12:08:00.000Z',
  },
  {
    id: 'demo-notifications-manual',
    title: 'Notification digest job skipped a window',
    description:
      'Hourly email digest did not run at 17:00 UTC. Manual creates have no AI analysis yet.',
    source: 'notifications',
    severity: 'medium',
    status: 'investigating',
    errorType: 'JobSkipped',
    metadata: {
      environment: 'production',
      region: 'us-east-1',
    },
    createdAt: '2026-11-04T17:10:00.000Z',
    updatedAt: '2026-11-04T17:25:00.000Z',
  },
];
