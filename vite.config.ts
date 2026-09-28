import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    middlewareMode: false,
  },
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // Measure the shipped source only. `src/main.ts` stays in on purpose so
      // the untested UI integration remains visible in the totals (#149).
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.fixture.ts', 'src/**/*.d.ts'],
      // Just under the measured totals, so CI fails when coverage drops.
      // Raise them as `src/main.ts` is split into tested modules.
      thresholds: { statements: 69, branches: 90, functions: 95, lines: 69 },
    },
  },
});
