import { writeFileSync } from 'node:fs';
import { chooseCpuAction } from '../src/ai/rules';
import { maps, operationScenarios, createScenarioInitialState } from '../src/game/maps';
import { applyGameCommand } from '../src/game/session';
import type { GameState } from '../src/game/types';

const rows = [];
for (const id of ['skirmish', 'tactics-logistics'])
  for (const seed of [1501, 1502])
    for (const first of ['red', 'blue'] as const)
      for (const ruleVersion of [13, 14] as const) {
        const map = [...maps, ...operationScenarios].find((m) => m.id === id)!;
        let state: GameState = { ...createScenarioInitialState(map), ruleVersion, rngSeed: seed, activePlayer: first };
        let commands = 0,
          orders = 0;
        const began = performance.now();
        while (!state.winner && !state.draw && state.turn <= 20 && commands < 3000) {
          const command = chooseCpuAction(state, 'normal');
          const next = applyGameCommand(state, command);
          if (!next.ok) throw Error(`${id}/${ruleVersion}/${command.type}: ${next.error}`);
          if (command.type === 'logistics') orders++;
          state = next.value;
          commands++;
        }
        rows.push({
          id,
          seed,
          first,
          ruleVersion,
          winner: state.winner ?? null,
          draw: !!state.draw,
          bounded: !state.winner && !state.draw,
          turn: state.turn,
          commands,
          orders,
          gold: { red: state.players.red.gold, blue: state.players.blue.gold },
          units: { red: state.units.filter((u) => u.owner === 'red').length, blue: state.units.filter((u) => u.owner === 'blue').length },
          milliseconds: performance.now() - began,
        });
      }
writeFileSync(
  'docs/reviews/v1.5.0/logistics-comparison.json',
  JSON.stringify(
    {
      note: 'Bounded normal CPU comparisons. Blue-first starts at the ordinary round counter and is a legal stress condition, not a calibrated first-player fairness estimate. Two fixed combat seeds; no global balance claim.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ games: rows.length, completed: rows.filter((r) => !r.bounded).length, orders: rows.reduce((sum, r) => sum + r.orders, 0) }));
