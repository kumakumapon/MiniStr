import { expect, it } from 'vitest';
import { fourArmyFairnessCases, summarizeFourArmyFairness } from './fourArmyFairness';
import { fourArmyAssessmentCases } from './fourArmyAssessment';

const previous = fourArmyAssessmentCases()
  .slice(0, 20)
  .map((spec) => ({ cpuVersion: 'four-army-cpu-v3', outcome: { type: 'ongoing' }, spec, traceSha256: 'trace', finalStateSha256: 'state' }));
it('freezes paired rule/CPU cohorts with all twenty controls and all twenty-four fresh orders', () => {
  const cases = fourArmyFairnessCases(previous);
  expect(cases).toHaveLength(192);
  for (const rules of ['classic', 'expanded'])
    for (const cpuVersion of ['four-army-cpu-v3', 'four-army-cpu-v4']) {
      const paired = cases.filter((c) => c.rules === rules && c.cpuVersion === cpuVersion);
      expect(paired.filter((c) => c.cohort === 'orders')).toHaveLength(24);
      expect(paired.filter((c) => c.cohort === 'cutoffs')).toHaveLength(20);
      expect(paired.filter((c) => c.cohort === 'settings')).toHaveLength(4);
      expect(new Set(paired.filter((c) => c.cohort === 'orders').map((c) => c.spec.order.join(','))).size).toBe(24);
    }
  const one = cases.filter((c) => c.spec.id === 'orders-152001-0');
  expect(one.map((c) => c.spec)).toEqual(Array(4).fill(one[0]!.spec));
  expect(cases.filter((c) => c.baselineTrace)).toHaveLength(20);
  expect(() => fourArmyFairnessCases(previous.slice(1))).toThrow();
  expect(() => fourArmyFairnessCases([...previous.slice(1), previous[1]!])).toThrow();
});
it('keeps unfinished comparisons censored instead of manufacturing draws or an unconditional fairness verdict', () => {
  const summary = summarizeFourArmyFairness([
    {
      cohort: 'orders',
      rules: 'expanded',
      cpuVersion: 'four-army-cpu-v4',
      spec: { order: ['army2', 'army1', 'army3', 'army4'] },
      outcome: { type: 'victory', winner: 'army2' },
      fallbacks: 0,
    },
    { cohort: 'orders', rules: 'expanded', cpuVersion: 'four-army-cpu-v4', spec: { order: ['army1', 'army2', 'army3', 'army4'] }, outcome: { type: 'ongoing' }, fallbacks: 1 },
  ]);
  const measured = summary.find((r) => r.cohort === 'orders' && r.rules === 'expanded' && r.cpuVersion === 'four-army-cpu-v4')!;
  expect(measured).toMatchObject({ cases: 2, victories: 1, draws: 0, ongoing: 1, verdict: 'censored-outcomes', fallbacks: 1 });
  expect(measured.armies[1]).toMatchObject({ army: 'army2', wins: 1, possibleFractionWithCensored: [0.5, 1] });
  expect(measured.seats[0]!.wins).toBe(1);
  expect(summary.find((r) => r.rules === 'classic')!.verdict).toBe('not-measured');
});
