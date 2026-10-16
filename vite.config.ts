import { configDefaults, defineConfig } from 'vitest/config';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const version = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;
const sha =
  process.env.GITHUB_SHA ??
  (() => {
    try {
      return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
        encoding: 'utf8',
      }).trim();
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
    exclude: [...configDefaults.exclude, 'tests/e2e/**', 'tests/integration/**'],
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          exclude: ['src/ui/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/ui/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // Measure the shipped source only. `src/main.ts` stays in on purpose so
      // the untested UI integration remains visible in the totals (#149).
      // Vitest 5 also counts functions and branches in files never imported.
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.fixture.ts', 'src/**/*.d.ts'],
      // Rebased on Vitest 5's measured totals (see the dependency review).
      // The global gate includes main.ts; directory gates also protect the
      // tested modules independently of the uncovered UI integration.
      thresholds: {
        statements: 62,
        branches: 60,
        functions: 68,
        lines: 65,
        'src/ai/**': { statements: 98, branches: 96, functions: 98, lines: 99 },
        'src/game/**': { statements: 91, branches: 89, functions: 95, lines: 95 },
        'src/ui/**': { statements: 79, branches: 72, functions: 83, lines: 81 },
      },
    },
  },
});
