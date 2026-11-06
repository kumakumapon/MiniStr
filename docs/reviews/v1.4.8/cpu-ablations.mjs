import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import process from 'node:process';

// Nine preselected conditions, each including both initiative legs. Use the same
// runner for released and candidate source trees; do not select seeds by results.
const [source, output] = process.argv.slice(2);
if (!source || !output || process.argv.length !== 4) throw Error('Usage: node scripts/cpu-limited-v148.mjs SOURCE_DIRECTORY OUTPUT_DIRECTORY');
const directory = resolve(source),
  destination = resolve(output);
mkdirSync(destination, { recursive: true });
const cases = [['inland',32,'none','v146-final',1466],['coast',32,'coast','v146-hold',1461],['held-coast',32,'coast','v147-hold',1473]];
const manifest = {
  format: 'cpu-limited-v148',
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
  const result = spawnSync(process.execPath, args, { cwd: directory, encoding: 'utf8', timeout: 1_850_000, maxBuffer: 1_000_000 });
  writeFileSync(resolve(destination, `${name}.log`), (result.stdout ?? '') + (result.stderr ?? ''));
  manifest.cases.push({ name, args, exit: result.status, error: result.error?.message });
  writeFileSync(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (result.error || result.status !== 0) throw Error(`Comparison failed for ${name}; see its log`);
  process.stdout.write(`${name}: both legs complete\n`);
}
