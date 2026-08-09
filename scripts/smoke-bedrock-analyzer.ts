/**
 * Manual, opt-in Bedrock Converse smoke (SCRUM-38).
 *
 * Does NOT run in unit tests or CI. Requires AWS credentials and model access.
 *
 * Usage (from repo root):
 *   BEDROCK_MODEL_ID=amazon.nova-lite-v1:0 npx tsx scripts/smoke-bedrock-analyzer.ts
 */
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

import { BedrockIncidentAnalyzer } from '../apps/incident-processor/src/analysis/bedrock-incident-analyzer.js';

async function main(): Promise<void> {
  const modelId = process.env.BEDROCK_MODEL_ID?.trim();
  if (!modelId) {
    throw new Error('Set BEDROCK_MODEL_ID to a model or inference-profile ID');
  }

  const region =
    process.env.BEDROCK_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    'us-east-1';

  const analyzer = new BedrockIncidentAnalyzer({
    client: new BedrockRuntimeClient({ region }),
    modelId,
    logger: {
      info(obj, msg) {
        console.error(JSON.stringify({ ...obj, msg }));
      },
    },
  });

  const analysis = await analyzer.analyze({
    service: 'incidentlens-smoke',
    severity: 'medium',
    errorType: 'Error',
    statusCode: 500,
    route: '/test-error',
    environment: 'dev',
    safeMessage: 'controlled smoke failure',
  });

  // Bounded structured fields only — do not dump raw provider payloads.
  console.log(
    JSON.stringify(
      {
        summary: analysis.summary,
        possibleCause: analysis.possibleCause,
        recommendedActions: analysis.recommendedActions,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown error';
  console.error(`Bedrock smoke failed: ${message}`);
  process.exitCode = 1;
});
