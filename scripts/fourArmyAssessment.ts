import { FOUR_ARMY_IDS, type FourArmyId } from '../src/game/fourArmyFoundation';
import { defaultFourArmyCpuSettings, type FourArmyCpuSettings } from '../src/ai/fourArmyCpu';
export const fourArmyOrders = (ids: readonly FourArmyId[] = FOUR_ARMY_IDS): FourArmyId[][] =>
  ids.length ? ids.flatMap((a) => fourArmyOrders(ids.filter((v) => v !== a)).map((rest) => [a, ...rest])) : [[]];
export interface AssessmentCase {
  id: string;
  group: 'orders' | 'settings' | 'continuation';
  seed: number;
  order: FourArmyId[];
  settings: FourArmyCpuSettings;
  maxRound: number;
  maxCommands: number;
}
/** Fixed before measuring. Outcomes at a measurement budget remain ongoing, never draws. */
export function fourArmyAssessmentCases(): AssessmentCase[] {
  const cases: AssessmentCase[] = [];
  for (const seed of [15141, 15142, 15143])
    fourArmyOrders().forEach((order, i) =>
      cases.push({ id: `orders-${seed}-${i}`, group: 'orders', seed, order, settings: defaultFourArmyCpuSettings(), maxRound: 400, maxCommands: 65536 }),
    );
  for (const seed of [15144, 15145, 15146])
    for (let rotation = 0; rotation < 4; rotation++) {
      const settings = defaultFourArmyCpuSettings();
      FOUR_ARMY_IDS.forEach((a, i) => {
        const n = (i + rotation) % 4;
        settings[a] = { difficulty: (['easy', 'normal', 'hard', 'normal'] as const)[n]!, policy: (['balanced', 'offensive', 'defensive', 'balanced'] as const)[n]! };
      });
      cases.push({
        id: `settings-${seed}-${rotation}`,
        group: 'settings',
        seed,
        order: [...FOUR_ARMY_IDS.slice(rotation), ...FOUR_ARMY_IDS.slice(0, rotation)],
        settings,
        maxRound: 400,
        maxCommands: 65536,
      });
    }
  for (let rotation = 0; rotation < 4; rotation++)
    cases.push({
      id: `continuation-42-${rotation}`,
      group: 'continuation',
      seed: 42,
      order: [...FOUR_ARMY_IDS.slice(rotation), ...FOUR_ARMY_IDS.slice(0, rotation)],
      settings: defaultFourArmyCpuSettings(),
      maxRound: 1000,
      maxCommands: 65536,
    });
  return cases;
}
export interface AssessmentOutcome {
  id: string;
  group: AssessmentCase['group'];
  order: FourArmyId[];
  outcome: { type: string; winner?: FourArmyId };
}
export function summarizeFourArmyAssessment(rows: readonly AssessmentOutcome[]) {
  return (['orders', 'settings', 'continuation'] as const).map((group) => {
    const cases = rows.filter((r) => r.group === group),
      n = cases.length,
      ongoing = cases.filter((r) => r.outcome.type === 'ongoing').length;
    return {
      group,
      cases: n,
      victories: cases.filter((r) => r.outcome.type === 'victory').length,
      draws: cases.filter((r) => r.outcome.type === 'draw').length,
      ongoing,
      armies: FOUR_ARMY_IDS.map((army) => {
        const wins = cases.filter((r) => r.outcome.winner === army).length;
        return { army, wins, observedWinFraction: n ? wins / n : null, possibleFractionWithCensored: n ? [wins / n, (wins + ongoing) / n] : null };
      }),
      seats: [0, 1, 2, 3].map((seat) => ({ seat: seat + 1, wins: cases.filter((r) => r.outcome.type === 'victory' && r.order[seat] === r.outcome.winner).length })),
      verdict: n === 0 ? 'not-measured' : ongoing ? 'censored-outcomes' : 'finite-sample-complete',
    };
  });
}
