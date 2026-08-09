#!/usr/bin/env node
/**
 * Builds deployable Lambda packages under dist/lambda/{api,processor}.
 * Usage (from repo root):
 *   npm run build:lambda              # both
 *   node scripts/package-lambda.mjs api
 *   node scripts/package-lambda.mjs processor
 */
import { execSync } from 'node:child_process';
import {
  cp,
  mkdir,
  readdir,
  rm,
  stat,
  writeFile,
  readFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetArg = (process.argv[2] ?? 'all').toLowerCase();

async function removeTestArtifacts(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Never ship unit-test trees in Lambda packages.
      if (entry.name === 'tests' || entry.name === '__tests__') {
        await rm(fullPath, { recursive: true, force: true });
        continue;
      }
      await removeTestArtifacts(fullPath);
      continue;
    }
    if (
      entry.name.endsWith('.test.js') ||
      entry.name.endsWith('.test.js.map')
    ) {
      await rm(fullPath, { force: true });
    }
  }
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function copyCompiledTree(sourceRelative, destDir) {
  const source = path.join(root, 'dist', sourceRelative);
  if (!(await pathExists(source))) {
    throw new Error(`Missing compiled output: ${source}`);
  }
  const dest = path.join(destDir, sourceRelative);
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(source, dest, { recursive: true });
}

async function packageTarget({
  name,
  packageDir,
  includePaths,
  dependencies,
  handler,
}) {
  console.log(`Preparing ${name} package at ${packageDir}...`);
  await rm(packageDir, { recursive: true, force: true });
  await mkdir(packageDir, { recursive: true });

  for (const relative of includePaths) {
    await copyCompiledTree(relative, packageDir);
  }

  await removeTestArtifacts(packageDir);

  const lambdaPackage = {
    name,
    version: rootPackage.version,
    private: true,
    type: 'module',
    dependencies,
  };

  await writeFile(
    path.join(packageDir, 'package.json'),
    `${JSON.stringify(lambdaPackage, null, 2)}\n`,
  );

  console.log(`Installing production dependencies into ${packageDir}...`);
  execSync('npm install --omit=dev --no-package-lock', {
    cwd: packageDir,
    stdio: 'inherit',
  });

  console.log(`${name} package ready at ${packageDir}`);
  console.log(`Handler: ${handler}`);
}

const rootPackage = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
);

const pinoVersion =
  rootPackage.dependencies.pino ??
  rootPackage.devDependencies?.pino ??
  '^10.0.0';

console.log('Compiling TypeScript...');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

// API Lambda does not call Bedrock — exclude the runtime client from its artifact.
const apiDependencies = Object.fromEntries(
  Object.entries(rootPackage.dependencies).filter(
    ([name]) => name !== '@aws-sdk/client-bedrock-runtime',
  ),
);

const targets = {
  api: {
    name: 'incidentlens-api-lambda',
    packageDir: path.join(root, 'dist', 'lambda', 'api'),
    includePaths: ['apps/demo-api', 'packages'],
    dependencies: apiDependencies,
    handler: 'apps/demo-api/src/lambda.handler',
  },
  processor: {
    name: 'incidentlens-processor-lambda',
    packageDir: path.join(root, 'dist', 'lambda', 'processor'),
    // Domain + repository packages required for automatic incident persistence.
    includePaths: ['apps/incident-processor', 'packages'],
    dependencies: {
      pino: pinoVersion,
      '@aws-sdk/client-dynamodb':
        rootPackage.dependencies['@aws-sdk/client-dynamodb'],
      '@aws-sdk/lib-dynamodb':
        rootPackage.dependencies['@aws-sdk/lib-dynamodb'],
      '@aws-sdk/client-bedrock-runtime':
        rootPackage.dependencies['@aws-sdk/client-bedrock-runtime'],
    },
    handler: 'apps/incident-processor/src/handler.handler',
  },
};

const selected =
  targetArg === 'all'
    ? Object.keys(targets)
    : targetArg in targets
      ? [targetArg]
      : null;

if (!selected) {
  console.error(`Unknown target "${targetArg}". Use: api | processor | all`);
  process.exit(1);
}

for (const key of selected) {
  await packageTarget(targets[key]);
}
