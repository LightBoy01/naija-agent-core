import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'hermes-agent/**', '**/cypress/**', '**/.{idea,git,cache,output,temp}/**', '**/.next/**'],
    testTimeout: 15000,
  },
});
