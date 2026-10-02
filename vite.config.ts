import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const version = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;
const sha =
  process.env.GITHUB_SHA ??
  (() => {
    try {
      return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
      return 'source-archive';
    }
  })();

export default defineConfig({
  define: { __BUILD_INFO__: JSON.stringify({ version, sha }) },
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    middlewareMode: false,
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['src/ui/**/*.test.ts', 'jsdom']],
    exclude: [...configDefaults.exclude, 'tests/e2e/**', 'tests/integration/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // Measure the shipped source only. `src/main.ts` stays in on purpose so
      // the untested UI integration remains visible in the totals (#149). While
      // no test imports it, v8 counts it as one function and one branch, so it
      // lowers statements and lines only.
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.fixture.ts', 'src/**/*.d.ts'],
      // Just under the measured totals, so CI fails when coverage drops. Each
      // function is ~0.3pt, so functions keeps room for a few untested ones.
      // Raise them as `src/main.ts` is split into tested modules.
      thresholds: { statements: 69, branches: 90, functions: 94, lines: 69 },
    },
  },
});
