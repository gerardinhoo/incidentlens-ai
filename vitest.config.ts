import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'apps/**/*.test.ts',
      'packages/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    exclude: ['apps/web/**', 'node_modules/**', 'dist/**'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'apps/demo-api/src/**/*.ts',
        'apps/incident-processor/src/**/*.ts',
        'packages/analysis/src/**/*.ts',
      ],
      exclude: [
        'apps/demo-api/src/**/*.test.ts',
        'apps/demo-api/src/server.ts',
        'apps/demo-api/src/types/**/*.ts',
        'apps/incident-processor/src/**/*.test.ts',
        'apps/incident-processor/tests/**/*.ts',
        'packages/analysis/src/**/*.test.ts',
      ],
    },
  },
});
