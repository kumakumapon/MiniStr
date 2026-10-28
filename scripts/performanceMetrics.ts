import { performance } from 'node:perf_hooks';

/** Nearest-rank percentiles; memory deltas include GC and are not retained-heap measurements. */
export function timingSummary(values: readonly number[]) {
  if (!values.length || values.some((value) => !Number.isFinite(value) || value < 0)) throw Error('Invalid timing samples');
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]!;
  return { samples: sorted.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: sorted.at(-1)! };
}

export function measureOperation(run: () => unknown, samples: number, warmup: number, now = () => performance.now()) {
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 1000 || !Number.isSafeInteger(warmup) || warmup < 0 || warmup > 100) throw Error('Invalid sample count');
  for (let i = 0; i < warmup; i++) run();
  const heapBefore = process.memoryUsage().heapUsed;
  const values: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = now();
    run();
    values.push(now() - start);
  }
  return { ...timingSummary(values), warmup, heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore };
}
