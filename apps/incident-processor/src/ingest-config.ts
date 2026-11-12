export interface IngestConfig {
  nodeEnv: string;
  serviceName: string;
  logLevel: string;
  sqsCandidatesQueueUrl: string;
}

const ALLOWED_LOG_LEVELS = new Set([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);

function readOptional(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

/**
 * Ingest Lambda config: decode CloudWatch and enqueue candidates.
 * No repository, analyzer, or notifier — those belong on the worker.
 */
export function loadIngestConfig(
  env: NodeJS.ProcessEnv = process.env,
): IngestConfig {
  const nodeEnv = readOptional(env, 'NODE_ENV') ?? 'development';
  const serviceName =
    readOptional(env, 'SERVICE_NAME') ?? 'incidentlens-ingest';
  const logLevelRaw = (readOptional(env, 'LOG_LEVEL') ?? 'info').toLowerCase();
  if (!ALLOWED_LOG_LEVELS.has(logLevelRaw)) {
    throw new Error(
      `Invalid LOG_LEVEL "${env.LOG_LEVEL ?? ''}". Allowed: ${[...ALLOWED_LOG_LEVELS].join(', ')}`,
    );
  }

  const sqsCandidatesQueueUrl = readOptional(env, 'SQS_CANDIDATES_QUEUE_URL');
  if (!sqsCandidatesQueueUrl) {
    throw new Error('SQS_CANDIDATES_QUEUE_URL is required for ingest');
  }

  return {
    nodeEnv,
    serviceName,
    logLevel: logLevelRaw,
    sqsCandidatesQueueUrl,
  };
}

let cachedConfig: IngestConfig | undefined;

export function getIngestConfig(): IngestConfig {
  if (!cachedConfig) {
    cachedConfig = loadIngestConfig();
  }
  return cachedConfig;
}

export function resetIngestConfigCache(): void {
  cachedConfig = undefined;
}
