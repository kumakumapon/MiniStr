import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import process from 'node:process';

const directory = process.argv[2];
if (!directory) throw Error('Usage: node scripts/summarize-browser-profiles.mjs RESULTS_DIRECTORY');
const read = (name) => JSON.parse(readFileSync(join(directory, name), 'utf8'));
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b),
    n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};
function responseStats(samples) {
  if (samples.length !== 2 || samples.some((s) => s.selections.length !== 25)) throw Error('Incomplete response group');
  const warm = samples.flatMap((s) => s.selections.slice(1));
  return {
    warmHandlerP50: percentile(
      warm.map((x) => x.handlerMs),
      0.5,
    ),
    warmHandlerP95: percentile(
      warm.map((x) => x.handlerMs),
      0.95,
    ),
    warmPaintP50: percentile(
      warm.map((x) => x.paintMs),
      0.5,
    ),
    warmPaintP95: percentile(
      warm.map((x) => x.paintMs),
      0.95,
    ),
    firstHandlerP50: median(samples.map((s) => s.selections[0].handlerMs)),
    firstHandlerP95: percentile(
      samples.map((s) => s.selections[0].handlerMs),
      0.95,
    ),
    firstPaintP50: median(samples.map((s) => s.selections[0].paintMs)),
    firstPaintP95: percentile(
      samples.map((s) => s.selections[0].paintMs),
      0.95,
    ),
    coldTitleP50: median(samples.map((s) => s.coldTitleMs)),
    startHandlerP50: median(samples.map((s) => s.startHandlerMs)),
    resumePaintP50: median(samples.map((s) => s.resumePaintMs)),
    layoutCount: samples.reduce((sum, s) => sum + s.metrics.LayoutCount, 0),
    layoutSeconds: samples.reduce((sum, s) => sum + s.metrics.LayoutDuration, 0),
    longTasks: samples.reduce((sum, s) => sum + s.longTasks.length, 0),
    warmSamples: warm.length,
  };
}
const result = {
  format: 'browser-profile-summary-v143',
  percentile: 'Nearest rank ceil(n*p)-1; final response table takes the median of three paired group percentiles. Repeated selections are correlated.',
  response: [],
  memory: {},
  replay: {},
  files: {},
};
const responseHashes = new Set(),
  browsers = new Set();
for (const width of [1280, 390])
  for (const size of [16, 32]) {
    const pairs = [];
    for (let pair = 1; pair <= 3; pair++) {
      const group = { pair };
      for (const variant of ['before', 'after']) {
        const data = read(`${variant}-response-${pair}.json`);
        responseHashes.add(data.harnessSha256);
        browsers.add(data.browser);
        group[variant] = responseStats(data.samples.filter((s) => s.width === width && s.size === size));
      }
      pairs.push(group);
    }
    result.response.push({
      width,
      size,
      pairs,
      medianOfPairs: Object.fromEntries(['before', 'after'].map((v) => [v, Object.fromEntries(Object.keys(pairs[0][v]).map((k) => [k, median(pairs.map((p) => p[v][k]))]))])),
    });
  }
if (responseHashes.size !== 1 || browsers.size !== 1) throw Error('Response harness/browser differs');
for (const variant of ['before', 'after']) {
  const data = read(`${variant}-memory.json`);
  if (!data.completed || data.errors.length || data.actualWatchMs < 600_000 || !data.savedProgress[0]?.commands) throw Error('Incomplete ten-minute memory run');
  result.memory[variant] = {
    actualWatchMs: data.actualWatchMs,
    savedProgress: data.savedProgress,
    gcRows: data.rows.filter((r) => r.gc).map((r) => ({ phase: r.phase, heap: r.heap.usedSize, dom: r.dom, workerHeaps: r.workers.map((w) => w.usedSize ?? w.unavailable) })),
  };
  const replay = read(`${variant}-replay-memory.json`);
  if (!replay.completed || replay.errors.length || replay.rows.length !== 13) throw Error('Incomplete replay run');
  const loaded = replay.rows.filter((r) => r.phase.startsWith('replay-'));
  const closed = replay.rows.filter((r) => r.phase.startsWith('closed-'));
  result.replay[variant] = {
    harnessSha256: replay.harnessSha256,
    commands: replay.commands,
    warmLoadedHeapMedian: median(loaded.slice(3).map((r) => r.heap.usedSize)),
    warmClosedHeapMedian: median(closed.slice(3).map((r) => r.heap.usedSize)),
    closedDom: closed.map((r) => r.dom),
    workers: replay.rows.map((r) => r.workers),
  };
}
if (result.replay.before.harnessSha256 !== result.replay.after.harnessSha256) throw Error('Replay harness differs');
for (const file of readdirSync(directory)
  .filter((f) => f.endsWith('.json') && f !== 'summary.json')
  .sort()) {
  const bytes = readFileSync(join(directory, file));
  result.files[file] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}
writeFileSync(join(directory, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
