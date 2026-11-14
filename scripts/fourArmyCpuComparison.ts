import { fourArmyAssessmentCases, fourArmyOrders, type AssessmentCase } from './fourArmyAssessment';
import { type FourArmyCpuVersion } from '../src/ai/fourArmyCpuVersion';
export interface FourArmyComparisonCase {
  cohort: 'known' | 'holdout' | 'compatibility';
  cpuVersion: FourArmyCpuVersion;
  spec: AssessmentCase;
}
/** Holdout seeds and budgets are fixed before running the frozen candidate; no outcome-based reselection. */
export function fourArmyCpuComparisonCases(): FourArmyComparisonCase[] {
  const known = fourArmyAssessmentCases(),
    cases: FourArmyComparisonCase[] = known.map((spec) => ({ cohort: 'known', cpuVersion: 'four-army-cpu-v2', spec }));
  const holdout: AssessmentCase[] = [];
  for (const seed of [15151, 15152])
    fourArmyOrders().forEach((order, i) =>
      holdout.push({ id: `holdout-orders-${seed}-${i}`, group: 'orders', seed, order, settings: structuredClone(known[0]!.settings), maxRound: 400, maxCommands: 65536 }),
    );
  for (const seed of [15153, 15154])
    for (let rotation = 0; rotation < 4; rotation++) {
      const template = known.find((c) => c.id === `settings-15144-${rotation}`)!;
      holdout.push({ ...structuredClone(template), id: `holdout-settings-${seed}-${rotation}`, seed });
    }
  for (const cpuVersion of ['four-army-cpu-v1', 'four-army-cpu-v2'] as const) for (const spec of holdout) cases.push({ cohort: 'holdout', cpuVersion, spec });
  cases.push({ cohort: 'compatibility', cpuVersion: 'four-army-cpu-v1', spec: known.find((c) => c.id === 'orders-15141-14')! });
  return cases;
}
