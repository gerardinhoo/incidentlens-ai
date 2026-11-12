import pino, { type Logger } from 'pino';

export interface ProcessorLogConfig {
  nodeEnv: string;
  serviceName: string;
  logLevel: string;
}

let rootLogger: Logger | undefined;

/**
 * Returns a stable root Pino logger for the processor (JSON to stdout).
 * Lambda logging_config Text mode keeps these lines as plain JSON (same approach as the API).
 */
export function getProcessorLogger(config: ProcessorLogConfig): Logger {
  if (!rootLogger) {
    rootLogger = pino({
      level: config.logLevel,
      base: {
        service: config.serviceName,
        environment: config.nodeEnv,
      },
    });
  }
  return rootLogger;
}

/** Test helper to reset the root logger between cases. */
export function resetProcessorLogger(): void {
  rootLogger = undefined;
}

export function createInvocationLogger(
  config: ProcessorLogConfig,
  requestId: string,
): Logger {
  return getProcessorLogger(config).child({ requestId });
}
