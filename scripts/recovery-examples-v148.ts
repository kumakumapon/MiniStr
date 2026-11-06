import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyGameCommand, createScenarioInitialState, endTurn, isGameState, type GameState, type PlayerId } from '../src/game';
import { force, operation, valueOf } from '../src/game/operations.fixture';
import { chooseCpuAction } from '../src/ai/rules';
import { comparisonSourceDigest } from './generatedBalance';

const [output] = process.argv.slice(2);
if (!output || process.argv.length !== 3) throw Error('Usage: vite-node scripts/recovery-examples-v148.ts OUTPUT.json');
const examples = [];
for (const player of ['red', 'blue'] as const) {
  const foe: PlayerId = player === 'red' ? 'blue' : 'red';
  const make = (hold = false): GameState => {
    const mission = hold ? [{ type: 'hold' as const, positions: [{ x: 6, y: 2 }], turns: 30, groundOnly: true }] : [{ type: 'eliminate' as const }];
    const state = createScenarioInitialState(
      operation({
        board: { width: 20, height: 6, cells: [] },
        victoryConditions: player === 'red' ? mission : [{ type: 'eliminate' }],
        defeatConditions: player === 'blue' ? mission : [{ type: 'eliminate' }],
      }),
    );
    state.activePlayer = player;
    state.recon = { remaining: { red: 0, blue: 0 }, centers: [] };
    state.players[player] = { ...state.players[player], gold: 5000, income: 0 };
    state.board.terrain[2]![0] = { kind: 'city', owner: player };
    state.board.terrain[2]![19] = { kind: 'capital', owner: foe };
    state.units = [
      force('hurt', hold ? 'artillery' : 'recon', hold ? 6 : 0, 2, { owner: player, hp: hold ? 30 : 41 }),
      ...(hold ? [force('relief', 'tank', 6, 4, { owner: player })] : []),
      force('enemy', 'infantry', 19, 5, { owner: foe }),
    ];
    return state;
  };
  for (const holding of [false, true]) {
    let state = make(holding);
    if (!isGameState(state)) throw Error('Invalid unit-test state');
    const commands = [];
    for (let step = 0; step < (holding ? 2 : 1); step++) {
      const command = chooseCpuAction(state, 'normal', player, 'defensive');
      state = valueOf(applyGameCommand(state, command));
      commands.push(command);
    }
    state = endTurn(endTurn(state));
    const next = chooseCpuAction(state, 'normal', player, 'defensive');
    valueOf(applyGameCommand(state, next));
    examples.push({ player, holding, commands, afterUpkeep: state.units.filter((unit) => unit.owner === player), holdProgress: state.objectiveHoldTurns?.[player], next });
  }
  const shooting = make();
  shooting.units[1] = force('enemy', 'infantry', 1, 2, { owner: foe, hp: 1 });
  const command = chooseCpuAction(shooting, 'normal', player, 'defensive');
  valueOf(applyGameCommand(shooting, command));
  examples.push({ player, shooting: true, command });
}
writeFileSync(
  output,
  JSON.stringify(
    {
      format: 'recovery-examples-v148',
      source: comparisonSourceDigest(),
      harnessSha256: createHash('sha256')
        .update(readFileSync(new URL(import.meta.url)))
        .digest('hex'),
      note: 'Counterfactual unit-test states with edited HP/units/terrain. These are not canonical new-game saves or historical battle prefixes. Every emitted command is applied through the normal legal command API.',
      examples,
    },
    null,
    2,
  ) + '\n',
);
