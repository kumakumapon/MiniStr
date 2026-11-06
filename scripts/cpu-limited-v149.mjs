import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import process from 'node:process';

const [source, output, group] = process.argv.slice(2);
if (!source || !output || !['regression', 'holdout'].includes(group) || process.argv.length !== 5) throw Error('Usage: SOURCE OUTPUT regression|holdout');
const directory = resolve(source),
  destination = resolve(output);
mkdirSync(destination, { recursive: true });
// All conditions are selected before candidate evaluation. Holdout is run only
// after the CPU judgement is fixed; retain every result, including regressions.
const cases =
  group === 'regression'
    ? [
        ['inland', 32, 'none', 'v146-final', 1466],
        ['coast', 32, 'coast', 'v146-hold', 1461],
        ['control', 20, 'coast', 'v146-hold', 1461],
        ['held-inland', 32, 'none', 'v147-hold', 1473],
        ['held-coast', 32, 'coast', 'v147-hold', 1473],
        ['new-inland', 32, 'none', 'v148-hold', 1481],
        ['new-coast', 32, 'coast', 'v148-hold', 1481],
        ['hold-objective', 16, 'none', 'v148-hold', 1481, 'supply-ridge'],
        ['control-objective', 16, 'none', 'v148-hold', 1481, 'supply-contest'],
        ['validation-inland', 32, 'none', 'v148-check', 1488],
        ['validation-coast', 32, 'coast', 'v148-check', 1488],
      ]
    : [
        ['holdout-inland', 32, 'none', 'v149-hold', 1491],
        ['holdout-coast', 32, 'coast', 'v149-hold', 1491],
      ];
const manifest = {
  format: 'cpu-limited-v149',
  group,
  sourceDirectory: directory,
  runnerSha256: createHash('sha256')
    .update(readFileSync(new URL(import.meta.url)))
    .digest('hex'),
  cases: [],
};
for (const [name, size, sea, seed, damage, catalog] of cases) {
  const args = [
    'node_modules/.bin/vite-node',
    'scripts/tactical-balance.ts',
    '--profiles',
    'combined',
    '--layouts',
    'revised',
    '--sizes',
    String(size),
    '--seas',
    sea,
    '--seeds',
    seed,
    '--damage-seeds',
    String(damage),
    '--policies',
    'defensive:offensive',
    '--matchups',
    'normal:normal',
    '--rounds',
    '90',
    '--max-games',
    '2',
    '--seconds',
    '1800',
    '--output',
    resolve(destination, `${name}.jsonl`),
  ];
  if (catalog) args.push('--catalog', catalog);
  const result = spawnSync(process.execPath, args, { cwd: directory, encoding: 'utf8', timeout: 1850000, maxBuffer: 1000000 });
  writeFileSync(resolve(destination, `${name}.log`), (result.stdout ?? '') + (result.stderr ?? ''));
  manifest.cases.push({ name, args, exit: result.status, error: result.error?.message });
  writeFileSync(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (result.error || result.status !== 0) throw Error(`Comparison failed for ${name}; see its log`);
  process.stdout.write(`${name}: both legs complete\n`);
}
