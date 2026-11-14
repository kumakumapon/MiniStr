import { fourArmyCpuComparisonCases, type FourArmyComparisonCase } from './fourArmyCpuComparison';
import { fourArmyOrders } from './fourArmyAssessment';
export interface PathComparisonCase extends FourArmyComparisonCase {
  pathVersion?: 1;
}
/** v1.5.15 cases are development data; new seeds are fixed before measuring this frozen candidate. */
export function fourArmyPathComparisonCases(): PathComparisonCase[] {
  const previous = fourArmyCpuComparisonCases();
  const known = previous.filter((c) => c.cpuVersion === 'four-army-cpu-v2');
  const cases: PathComparisonCase[] = known.map((c) => ({ ...c, cohort: 'known', cpuVersion: 'four-army-cpu-v3', pathVersion: 1 }));
  const holdout = [
    ...fourArmyOrders().map((order, i) => ({ ...structuredClone(known[0]!.spec), id: `fresh-orders-15161-${i}`, seed: 15161, order })),
    ...[0, 1, 2, 3].map((i) => ({ ...structuredClone(known.find((c) => c.spec.id === `settings-15144-${i}`)!.spec), id: `fresh-settings-15163-${i}`, seed: 15163 })),
  ];
  for (const cpuVersion of ['four-army-cpu-v2', 'four-army-cpu-v3'] as const)
    for (const spec of holdout) cases.push({ cohort: 'holdout', cpuVersion, ...(cpuVersion === 'four-army-cpu-v3' ? { pathVersion: 1 as const } : {}), spec });
  for (const cpuVersion of ['four-army-cpu-v1', 'four-army-cpu-v2'] as const)
    cases.push({ cohort: 'compatibility', cpuVersion, spec: known.find((c) => c.spec.id === 'orders-15141-14')!.spec });
  return cases;
}
