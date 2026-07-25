import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'apps/**/*.test.ts',
      'packages/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['apps/demo-api/src/**/*.ts'],
      exclude: [
        'apps/demo-api/src/**/*.test.ts',
        'apps/demo-api/src/server.ts',
        'apps/demo-api/src/types/**/*.ts',
      ],
    },
  },
});
