import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    maxWorkers: 2,
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    sequence: { concurrent: false },
  },
});