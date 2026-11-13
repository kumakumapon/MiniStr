import { describe, expect, it } from 'vitest';
import { fourArmyCpuComparisonCases } from './fourArmyCpuComparison';
import { isFourArmyCpuSettings } from '../src/ai/fourArmyCpu';
describe('frozen four-army CPU comparison protocol', () => {
  it('keeps all 88 original cases and pairs the 56 preselected holdouts across CPU versions', () => {
    const cases = fourArmyCpuComparisonCases();
    expect(cases).toHaveLength(201);
    expect(new Set(cases.map((c) => c.cohort + ':' + c.cpuVersion + ':' + c.spec.id)).size).toBe(201);
    expect(cases.filter((c) => c.cohort === 'known')).toHaveLength(88);
    const holdout = cases.filter((c) => c.cohort === 'holdout');
    expect(holdout).toHaveLength(112);
    for (const c of holdout.filter((c) => c.cpuVersion === 'four-army-cpu-v1'))
      expect(holdout.find((n) => n.spec.id === c.spec.id && n.cpuVersion === 'four-army-cpu-v2')!.spec).toEqual(c.spec);
  });
  it('does not reuse development seeds and preserves budgets and distinct difficulty groups', () => {
    for (const c of fourArmyCpuComparisonCases()) {
      expect(isFourArmyCpuSettings(c.spec.settings)).toBe(true);
      expect(c.spec.maxCommands).toBe(65536);
      if (c.cohort === 'holdout') {
        expect(c.spec.seed).toBeGreaterThanOrEqual(15151);
        expect(c.spec.maxRound).toBe(400);
      }
    }
  });
});
