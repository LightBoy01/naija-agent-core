import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'hermes-agent/**', '**/cypress/**', '**/.{idea,git,cache,output,temp}/**', '**/.next/**'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**/*.ts', 'packages/*/src/**/*.ts'],
      thresholds: {
        branches: 30,
        functions: 40,
        lines: 40,
        statements: 40,
      },
    },
  },
});
