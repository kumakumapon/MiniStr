import { fourArmyCapacityFixture } from '../tests/e2e/helpers/fourArmyMapProbe';
import { chooseFourArmyCpuCommand } from '../src/ai/fourArmyCpu';
import { chooseCpuAction } from '../src/ai';
import { observeFourArmy } from '../src/game/fourArmyEngine';
import { observeLogistics } from '../src/game/fog';
import { isGameState } from '../src/game/session';
import type { GameState, PlayerId } from '../src/game/types';
export function compareFourArmyCpu(samples = 20) {
  if (!Number.isInteger(samples) || samples < 1 || samples > 100) throw Error('Invalid sample count');
  const rows = [];
  const stats = (v: number[]) => {
    const a = [...v].sort((x, y) => x - y);
    return { count: a.length, p50: a[Math.ceil(a.length * 0.5) - 1]!, p95: a[Math.ceil(a.length * 0.95) - 1]!, max: a.at(-1)! };
  };
  for (const perArmy of [8, 16])
    for (const crowded of [false, true])
      for (const difficulty of ['normal', 'hard'] as const) {
        const { state } = fourArmyCapacityFixture(perArmy, crowded),
          observed = observeFourArmy(state, 'army1');
        if (!observed.ok) throw Error(observed.error);
        const owner = (a: string): PlayerId => (a === 'army1' || a === 'army3' ? 'red' : 'blue');
        const two: GameState = {
          board: { ...state.board, terrain: state.board.terrain.map((row) => row.map((t) => ({ ...t, owner: t.owner ? owner(t.owner) : undefined }))) },
          units: state.units.map((u) => ({ ...u, owner: owner(u.owner) })),
          players: { red: { gold: 25000, income: 10000 }, blue: { gold: 25000, income: 10000 } },
          activePlayer: 'red',
          turn: 1,
          rngSeed: state.rngSeed,
          nextUnitId: state.nextUnitId,
          ruleVersion: 12,
        };
        if (!isGameState(two)) throw Error('Invalid same-population two-army fixture');
        const view = observeLogistics(two, 'red'),
          timings = { two: [] as number[], four: [] as number[] };
        const four = (input = structuredClone(observed.value)) => chooseFourArmyCpuCommand(input, { difficulty, policy: 'balanced' }),
          legacy = (input = structuredClone(view)) => chooseCpuAction(input, difficulty);
        const expectedTwo = JSON.stringify(legacy()),
          expectedFour = JSON.stringify(four());
        for (let i = -5; i < samples; i++) {
          for (const kind of i % 2 === 0 ? (['two', 'four'] as const) : (['four', 'two'] as const)) {
            // A real Worker receives fresh DTOs. Clone outside timing so both algorithms start without per-state cache reuse.
            const twoInput = structuredClone(view),
              fourInput = structuredClone(observed.value);
            const start = performance.now(),
              chosen = kind === 'two' ? legacy(twoInput) : four(fourInput),
              elapsed = performance.now() - start;
            if (JSON.stringify(chosen) !== (kind === 'two' ? expectedTwo : expectedFour)) throw Error('Non-deterministic CPU fixture');
            if (i >= 0) timings[kind].push(elapsed);
          }
        }
        rows.push({ totalUnits: perArmy * 4, perFourArmy: perArmy, perTwoArmy: perArmy * 2, crowded, difficulty, twoMs: stats(timings.two), fourMs: stats(timings.four) });
      }
  return {
    inputPolicy: 'fresh structured clone per decision; cloning excluded; five warmups; alternating order',
    scope: 'Same total units on synthetic 32x32 fixtures. Different algorithms; not game-equivalent win-rate evidence.',
    rows,
  };
}
