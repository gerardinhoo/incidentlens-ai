export type IncidentRepositoryMode = 'memory' | 'dynamodb';
export type IncidentAnalyzerMode = 'fake' | 'bedrock';

export interface ProcessorConfig {
  nodeEnv: string;
  serviceName: string;
  logLevel: string;
  incidentRepository: IncidentRepositoryMode;
  dynamodbIncidentsTable?: string;
  /** Analyzer provider. Default fake — no Bedrock calls. */
  incidentAnalyzer: IncidentAnalyzerMode;
  /** Model ID or inference-profile ID. Required when incidentAnalyzer=bedrock. */
  bedrockModelId?: string;
  /** Optional Bedrock region override; defaults to AWS_REGION. */
  bedrockRegion?: string;
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
 * Validates and loads processor configuration from environment variables.
 * Does not import Fastify / demo-api config.
 */
export function loadProcessorConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProcessorConfig {
  const nodeEnv = readOptional(env, 'NODE_ENV') ?? 'development';
  const serviceName =
    readOptional(env, 'SERVICE_NAME') ?? 'incidentlens-processor';
  const logLevelRaw = (readOptional(env, 'LOG_LEVEL') ?? 'info').toLowerCase();
  if (!ALLOWED_LOG_LEVELS.has(logLevelRaw)) {
    throw new Error(
      `Invalid LOG_LEVEL "${env.LOG_LEVEL ?? ''}". Allowed: ${[...ALLOWED_LOG_LEVELS].join(', ')}`,
    );
  }

  const repositoryRaw = (
    readOptional(env, 'INCIDENT_REPOSITORY') ?? 'memory'
  ).toLowerCase();
  if (repositoryRaw !== 'memory' && repositoryRaw !== 'dynamodb') {
    throw new Error(
      `Invalid INCIDENT_REPOSITORY "${env.INCIDENT_REPOSITORY ?? ''}". Allowed values: memory, dynamodb`,
    );
  }

  const analyzerRaw = (
    readOptional(env, 'INCIDENT_ANALYZER') ?? 'fake'
  ).toLowerCase();
  if (analyzerRaw !== 'fake' && analyzerRaw !== 'bedrock') {
    throw new Error(
      `Invalid INCIDENT_ANALYZER "${env.INCIDENT_ANALYZER ?? ''}". Allowed values: fake, bedrock`,
    );
  }

  const config: ProcessorConfig = {
    nodeEnv,
    serviceName,
    logLevel: logLevelRaw,
    incidentRepository: repositoryRaw,
    incidentAnalyzer: analyzerRaw,
  };

  if (repositoryRaw === 'dynamodb') {
    const table = readOptional(env, 'DYNAMODB_INCIDENTS_TABLE');
    if (!table) {
      throw new Error(
        'DYNAMODB_INCIDENTS_TABLE is required when INCIDENT_REPOSITORY=dynamodb',
      );
    }
    config.dynamodbIncidentsTable = table;
  }

  const bedrockModelId = readOptional(env, 'BEDROCK_MODEL_ID');
  const bedrockRegion = readOptional(env, 'BEDROCK_REGION');
  if (bedrockModelId) {
    config.bedrockModelId = bedrockModelId;
  }
  if (bedrockRegion) {
    config.bedrockRegion = bedrockRegion;
  }

  if (analyzerRaw === 'bedrock' && !bedrockModelId) {
    throw new Error(
      'BEDROCK_MODEL_ID is required when INCIDENT_ANALYZER=bedrock',
    );
  }

  return config;
}

let cachedConfig: ProcessorConfig | undefined;

/** Cold-start cached configuration for Lambda invocations. */
export function getProcessorConfig(): ProcessorConfig {
  if (!cachedConfig) {
    cachedConfig = loadProcessorConfig();
  }
  return cachedConfig;
}

/** Test helper to clear the cold-start cache. */
export function resetProcessorConfigCache(): void {
  cachedConfig = undefined;
}
