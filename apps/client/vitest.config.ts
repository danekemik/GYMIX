import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    maxWorkers: 1,
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
