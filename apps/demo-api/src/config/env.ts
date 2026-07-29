const logLevels = new Set([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);

function resolveLogLevel(value: string | undefined): string {
  const level = (value ?? 'info').toLowerCase();
  return logLevels.has(level) ? level : 'info';
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
} as const;
