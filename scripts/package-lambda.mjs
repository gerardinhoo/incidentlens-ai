#!/usr/bin/env node
/**
 * Builds a deployable Lambda package under dist/lambda for Terraform archive_file.
 * Usage (from repo root): npm run build:lambda
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
const packageDir = path.join(root, 'dist', 'lambda');

async function removeTestArtifacts(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
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

console.log('Compiling TypeScript...');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

console.log('Preparing Lambda package directory...');
await rm(packageDir, { recursive: true, force: true });
await mkdir(packageDir, { recursive: true });

for (const folder of ['apps', 'packages']) {
  const source = path.join(root, 'dist', folder);
  if (!(await pathExists(source))) {
    throw new Error(`Missing compiled output: ${source}`);
  }
  await cp(source, path.join(packageDir, folder), { recursive: true });
}

await removeTestArtifacts(packageDir);

const rootPackage = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
);

const lambdaPackage = {
  name: 'incidentlens-api-lambda',
  version: rootPackage.version,
  private: true,
  type: 'module',
  dependencies: rootPackage.dependencies,
};

await writeFile(
  path.join(packageDir, 'package.json'),
  `${JSON.stringify(lambdaPackage, null, 2)}\n`,
);

console.log('Installing production dependencies into dist/lambda...');
execSync('npm install --omit=dev --no-package-lock', {
  cwd: packageDir,
  stdio: 'inherit',
});

console.log(`Lambda package ready at ${packageDir}`);
console.log('Handler: apps/demo-api/src/lambda.handler');
