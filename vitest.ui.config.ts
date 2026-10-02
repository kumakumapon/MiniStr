import { defineConfig } from 'vitest/config';

/** Integration tests execute the distribution bundle, including its startup code. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 15_000,
  },
});
