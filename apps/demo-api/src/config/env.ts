const logLevels = new Set([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveLogLevel(value: string | undefined): string {
  const level = (value ?? 'info').toLowerCase();
  return logLevels.has(level) ? level : 'info';
}

/**
 * Parse a feature flag from env. Default is disabled unless explicitly enabled.
 * Accepted truthy values: true | 1 | yes (case-insensitive).
 */
export function parseEnableFlag(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export const env = {
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
  logLevel: resolveLogLevel(process.env.LOG_LEVEL),
  serviceName: 'incidentlens-demo-api',
  serviceVersion: '1.0.0',
  /** Preferred repository backend: memory | dynamodb (validated at repository creation). */
  incidentRepository: process.env.INCIDENT_REPOSITORY ?? 'memory',
  awsRegion: process.env.AWS_REGION ?? 'us-east-1',
  dynamodbIncidentsTable: process.env.DYNAMODB_INCIDENTS_TABLE,
  dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT,
  /**
   * When true, registers GET /test-error for controlled incident-candidate demos.
   * Default false — disabled in public/shared deployments unless explicitly enabled.
   */
  enableTestErrorEndpoint: parseEnableFlag(
    process.env.ENABLE_TEST_ERROR_ENDPOINT,
  ),
  /**
   * POST /incidents in-memory token bucket (per instance).
   * Burst of `capacity`, then ~refillPerMinute sustained.
   */
  postIncidentsRateCapacity: parsePositiveInt(
    process.env.POST_INCIDENTS_RATE_CAPACITY,
    10,
  ),
  postIncidentsRateRefillPerMinute: parsePositiveInt(
    process.env.POST_INCIDENTS_RATE_REFILL_PER_MINUTE,
    10,
  ),
} as const;
