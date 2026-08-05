/**
 * Local invocation helper for the processor Lambda foundation.
 * Usage (from repo root): npm run dev:processor
 *
 * Does not contact AWS. Uses the same handler contract as the deployed Lambda.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleProcessorInvocation } from '../apps/incident-processor/src/handler.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(
  root,
  'tests/fixtures/processor/generic-event.json',
);

const event = JSON.parse(await readFile(fixturePath, 'utf8')) as unknown;

const result = await handleProcessorInvocation(event, {
  awsRequestId: `local-${Date.now()}`,
});

console.log(JSON.stringify(result, null, 2));
