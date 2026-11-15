import { fourArmyOrders, type AssessmentCase } from './fourArmyAssessment';
import { defaultFourArmyCpuSettings } from '../src/ai/fourArmyCpu';
import type { FourArmyCpuVersion } from '../src/ai/fourArmyCpuVersion';
import { FOUR_ARMY_IDS, type FourArmyId } from '../src/game/fourArmyFoundation';

export interface FairnessCase {
  cohort: 'orders' | 'cutoffs' | 'settings';
  rules: 'classic' | 'expanded';
  cpuVersion: Extract<FourArmyCpuVersion, 'four-army-cpu-v3' | 'four-army-cpu-v4'>;
  spec: AssessmentCase;
  baselineTrace?: string;
  baselineState?: string;
}
export const fourArmyFairnessKey = (c: FairnessCase): string => `${c.spec.id}/${c.rules}/${c.cpuVersion}`;
/** Reallocate unfinished cases without changing the selected cohort or duplicating completed measurements. */
export function remainingFourArmyFairnessCases(cases: readonly FairnessCase[], completed: readonly FairnessCase[]): FairnessCase[] {
  const expected = new Map(cases.map((c) => [fourArmyFairnessKey(c), c]));
  const keys = new Set<string>();
  for (const c of completed) {
    const key = fourArmyFairnessKey(c),
      original = expected.get(key);
    if (
      !original ||
      keys.has(key) ||
      c.cohort !== original.cohort ||
      JSON.stringify(c.spec) !== JSON.stringify(original.spec) ||
      c.baselineTrace !== original.baselineTrace ||
      c.baselineState !== original.baselineState
    )
      throw Error('Invalid or duplicated completed fairness case: ' + key);
    keys.add(key);
  }
  return cases.filter((c) => !keys.has(fourArmyFairnessKey(c)));
}
interface PreviousRow {
  cpuVersion: string;
  outcome: { type: string };
  spec: AssessmentCase;
  traceSha256: string;
  finalStateSha256: string;
}
/** Selected before measurement. v3/v4 and both rule sets use exactly the same seed/order/settings. */
export function fourArmyFairnessCases(previous: readonly PreviousRow[]): FairnessCase[] {
  const controls = previous.filter((r) => r.cpuVersion === 'four-army-cpu-v3' && r.outcome.type === 'ongoing');
  if (controls.length !== 20 || new Set(controls.map((r) => r.spec.id)).size !== 20) throw Error('Expected the published twenty v1.5.16 cutoffs');
  const specs: { cohort: FairnessCase['cohort']; spec: AssessmentCase; baseline?: PreviousRow }[] = [
    ...fourArmyOrders().map((order, i) => ({
      cohort: 'orders' as const,
      spec: { id: `orders-152001-${i}`, group: 'orders' as const, seed: 152001, order, settings: defaultFourArmyCpuSettings(), maxRound: 400, maxCommands: 65536 },
    })),
    ...controls.map((r) => ({ cohort: 'cutoffs' as const, spec: structuredClone(r.spec), baseline: r })),
    ...FOUR_ARMY_IDS.map((_, rotation) => {
      const settings = defaultFourArmyCpuSettings();
      FOUR_ARMY_IDS.forEach((army, i) => {
        const n = (i + rotation) % 4;
        settings[army] = { difficulty: (['easy', 'normal', 'hard', 'normal'] as const)[n]!, policy: (['balanced', 'offensive', 'defensive', 'balanced'] as const)[n]! };
      });
      return {
        cohort: 'settings' as const,
        spec: {
          id: `settings-152003-${rotation}`,
          group: 'settings' as const,
          seed: 152003,
          order: [...FOUR_ARMY_IDS.slice(rotation), ...FOUR_ARMY_IDS.slice(0, rotation)],
          settings,
          maxRound: 400,
          maxCommands: 65536,
        },
      };
    }),
  ];
  return specs.flatMap(({ cohort, spec, baseline }) =>
    (['classic', 'expanded'] as const).flatMap((rules) =>
      (['four-army-cpu-v3', 'four-army-cpu-v4'] as const).map((cpuVersion) => ({
        cohort,
        rules,
        cpuVersion,
        spec: structuredClone(spec),
        ...(rules === 'classic' && cpuVersion === 'four-army-cpu-v3' && baseline ? { baselineTrace: baseline.traceSha256, baselineState: baseline.finalStateSha256 } : {}),
      })),
    ),
  );
}
export interface FairnessOutcome {
  cohort: FairnessCase['cohort'];
  rules: FairnessCase['rules'];
  cpuVersion: FairnessCase['cpuVersion'];
  spec: { order: FourArmyId[] };
  outcome: { type: string; winner?: FourArmyId };
  fallbacks: number;
}
/** Report censored bounds as well as observed wins; a cutoff is never converted to a draw. */
export function summarizeFourArmyFairness(rows: readonly FairnessOutcome[]) {
  return (['orders', 'cutoffs', 'settings'] as const).flatMap((cohort) =>
    (['classic', 'expanded'] as const).flatMap((rules) =>
      (['four-army-cpu-v3', 'four-army-cpu-v4'] as const).map((cpuVersion) => {
        const selected = rows.filter((r) => r.cohort === cohort && r.rules === rules && r.cpuVersion === cpuVersion);
        const n = selected.length,
          ongoing = selected.filter((r) => r.outcome.type === 'ongoing').length;
        return {
          cohort,
          rules,
          cpuVersion,
          cases: n,
          ongoing,
          victories: selected.filter((r) => r.outcome.type === 'victory').length,
          draws: selected.filter((r) => r.outcome.type === 'draw').length,
          fallbacks: selected.reduce((sum, r) => sum + r.fallbacks, 0),
          armies: FOUR_ARMY_IDS.map((army) => {
            const wins = selected.filter((r) => r.outcome.winner === army).length;
            return { army, wins, observedWinFraction: n ? wins / n : null, possibleFractionWithCensored: n ? [wins / n, (wins + ongoing) / n] : null };
          }),
          seats: [0, 1, 2, 3].map((i) => ({ seat: i + 1, wins: selected.filter((r) => r.outcome.type === 'victory' && r.spec.order[i] === r.outcome.winner).length })),
          verdict: !n ? 'not-measured' : ongoing ? 'censored-outcomes' : 'finite-sample-complete',
        };
      }),
    ),
  );
}
