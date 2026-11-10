/**
 * US-037 — write mixed demo incidents directly to DynamoDB.
 * Does not call Bedrock, SNS, or the HTTP API.
 *
 * Usage (from repo root):
 *   AWS_REGION=us-east-1 \
 *   DYNAMODB_INCIDENTS_TABLE=incidentlens-dev-incidents \
 *     npm run seed:demo-incidents
 *
 * Options:
 *   --dry-run     print rows, do not write
 *   --overwrite   PutItem even when the demo id already exists
 *
 * Local `npm run dev` uses in-memory storage unless INCIDENT_REPOSITORY=dynamodb.
 * CloudFront / API Gateway reads the DynamoDB table this script writes.
 */
import { DEMO_INCIDENTS } from '../tests/fixtures/demo-incidents.js';
import { createIncidentRepository } from '../packages/repository/src/index.js';

function argFlag(name: string): boolean {
  return process.argv.includes(name);
}

const dryRun = argFlag('--dry-run');
const overwrite = argFlag('--overwrite');
const tableName = (
  process.env.DYNAMODB_INCIDENTS_TABLE ?? 'incidentlens-dev-incidents'
).trim();
const region = (process.env.AWS_REGION ?? 'us-east-1').trim();

if (tableName.length === 0) {
  throw new Error('DYNAMODB_INCIDENTS_TABLE must be a non-empty table name');
}

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        tableName,
        region,
        count: DEMO_INCIDENTS.length,
        ids: DEMO_INCIDENTS.map((incident) => incident.id),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const repository = createIncidentRepository({
  type: 'dynamodb',
  region,
  tableName,
});

const results: Array<{ id: string; result: string }> = [];

for (const incident of DEMO_INCIDENTS) {
  if (overwrite) {
    await repository.save(incident);
    results.push({ id: incident.id, result: 'overwritten' });
    continue;
  }

  const result = await repository.saveIfAbsent(incident);
  results.push({ id: incident.id, result });
}

console.log(
  JSON.stringify(
    {
      tableName,
      region,
      overwrite,
      results,
    },
    null,
    2,
  ),
);
