import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxWorkers: 1,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
