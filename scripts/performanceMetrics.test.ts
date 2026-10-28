import { describe, expect, it } from 'vitest';
import { measureOperation, timingSummary } from './performanceMetrics';
describe('performance measurements', () => {
  it('uses nearest-rank percentiles without mutating raw samples', () => {
    const values = [10, 1, 8, 3, 2];
    expect(timingSummary(values)).toEqual({ samples: 5, p50Ms: 3, p95Ms: 10, maxMs: 10 });
    expect(values).toEqual([10, 1, 8, 3, 2]);
    expect(timingSummary(Array.from({ length: 100 }, (_, i) => i + 1)).p95Ms).toBe(95);
  });
  it('excludes warmup from samples and checks operation counts', () => {
    let calls = 0,
      time = 0;
    const result = measureOperation(
      () => calls++,
      4,
      2,
      () => time++,
    );
    expect(calls).toBe(6);
    expect(result).toMatchObject({ samples: 4, warmup: 2, p50Ms: 1, p95Ms: 1, maxMs: 1 });
  });
  it('rejects empty, invalid or unbounded measurements and propagates failures', () => {
    for (const values of [[], [-1], [NaN], [Infinity]]) expect(() => timingSummary(values)).toThrow();
    for (const [samples, warmup] of [
      [0, 1],
      [1001, 1],
      [1.5, 1],
      [1, -1],
      [1, 101],
    ])
      expect(() => measureOperation(() => {}, samples!, warmup!)).toThrow();
    expect(() =>
      measureOperation(
        () => {
          throw Error('failed');
        },
        1,
        0,
      ),
    ).toThrow('failed');
  });
});
