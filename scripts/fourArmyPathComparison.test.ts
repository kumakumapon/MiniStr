import { expect, it } from 'vitest';
import { fourArmyPathComparisonCases } from './fourArmyPathComparison';
it('freezes 144 development conditions, 28 paired fresh conditions and two legacy digests', () => {
  const c = fourArmyPathComparisonCases();
  expect(c).toHaveLength(202);
  expect(c.filter((x) => x.cohort === 'known')).toHaveLength(144);
  const h = c.filter((x) => x.cohort === 'holdout');
  expect(h).toHaveLength(56);
  expect(new Set(h.map((x) => x.spec.seed))).toEqual(new Set([15161, 15163]));
  for (const a of h.filter((x) => x.cpuVersion === 'four-army-cpu-v2')) {
    const b = h.find((x) => x.spec.id === a.spec.id && x.cpuVersion === 'four-army-cpu-v3')!;
    expect(b.spec).toEqual(a.spec);
    expect(a.pathVersion).toBeUndefined();
    expect(b.pathVersion).toBe(1);
  }
});
