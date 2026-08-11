import type { IncidentDto } from '../../types/incident';

/**
 * HTTP fixtures matching the real IncidentLens API Incident JSON contract.
 * Used by frontend integration tests (SCRUM-50).
 */

export const paymentIncident: IncidentDto = {
  id: 'inc-payment-1',
  title: 'Payment API returning 500 errors',
  description:
    'Multiple requests to the payment API are returning HTTP 500 responses.',
  source: 'payment-api',
  severity: 'critical',
  status: 'open',
  errorType: 'InternalServerError',
  requestId: 'req-pay-100',
  metadata: {
    environment: 'production',
    region: 'us-east-1',
  },
  createdAt: '2026-08-10T15:30:00.000Z',
  updatedAt: '2026-08-10T15:35:00.000Z',
};

export const authIncidentWithAnalysis: IncidentDto = {
  id: 'inc-auth-2',
  title: 'Authentication latency increased',
  description:
    'Authentication requests are experiencing elevated response times.',
  source: 'auth-service',
  severity: 'high',
  status: 'investigating',
  errorType: 'HighLatency',
  metadata: {
    environment: 'production',
    region: 'us-east-1',
  },
  analysis: {
    status: 'completed',
    summary: 'Elevated auth latency correlates with dependency timeouts.',
    possibleCause: 'Upstream identity provider latency.',
    recommendedActions: [
      'Inspect identity provider latency dashboards',
      'Review recent auth-service deploys',
    ],
    analyzedAt: '2026-08-10T15:40:00.000Z',
  },
  createdAt: '2026-08-10T14:00:00.000Z',
  updatedAt: '2026-08-10T15:40:00.000Z',
};

export const workerIncidentNoAnalysis: IncidentDto = {
  id: 'inc-worker-3',
  title: 'Background worker processing delayed',
  description: 'Background processing is taking longer than expected.',
  source: 'incident-worker',
  severity: 'medium',
  status: 'open',
  errorType: 'ProcessingDelay',
  metadata: {
    environment: 'staging',
  },
  createdAt: '2026-08-10T13:00:00.000Z',
  updatedAt: '2026-08-10T13:00:00.000Z',
};

export const pendingAnalysisIncident: IncidentDto = {
  id: 'inc-pending-4',
  title: 'Checkout timeouts pending analysis',
  source: 'checkout-api',
  severity: 'high',
  status: 'open',
  errorType: 'TimeoutError',
  metadata: {},
  analysis: {
    status: 'pending',
  },
  createdAt: '2026-08-10T16:00:00.000Z',
  updatedAt: '2026-08-10T16:00:00.000Z',
};

export const listIncidentsFixture: IncidentDto[] = [
  paymentIncident,
  authIncidentWithAnalysis,
  workerIncidentNoAnalysis,
];
