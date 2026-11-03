import { writeFileSync } from 'node:fs';
import { applyGameCommand, createReplay, createScenarioInitialState, loadScenarioDefinitions, serializeReplay, type GameCommand } from '../src/game';

// Legal, completed 32×32 match; no CPU decisions or user saves are needed.
const loaded = loadScenarioDefinitions([
  {
    id: 'memory-v143',
    name: 'Memory fixture',
    briefing: '',
    startingGold: 0,
    turnLimit: 40,
    board: { width: 32, height: 32, cells: [] },
    initialUnits: (['red', 'blue'] as const).flatMap((owner) =>
      Array.from({ length: 16 }, (_, i) => ({
        kind: 'infantry',
        owner,
        x: owner === 'red' ? i : 31 - i,
        y: owner === 'red' ? 0 : 31,
      })),
    ),
    victoryConditions: [{ type: 'eliminate' }],
    defeatConditions: [{ type: 'eliminate' }],
  },
]);
if (!loaded.ok) throw Error(loaded.error);
const initialState = createScenarioInitialState(loaded.value[0]!);
let state = initialState;
const commands: GameCommand[] = [];
while (!state.winner && commands.length < 10_000) {
  const unit = state.units.find((u) => u.owner === state.activePlayer && !u.hasActed);
  const command: GameCommand = unit ? { type: 'wait', unitId: unit.id } : { type: 'endTurn' };
  const applied = applyGameCommand(state, command);
  if (!applied.ok) throw Error(applied.error);
  state = applied.value;
  commands.push(command);
}
const replay = createReplay({ mapId: 'memory-v143', difficulty: 'normal', initialState, commands });
if (!replay.ok) throw Error(replay.error);
const serialized = serializeReplay(replay.value);
if (!serialized.ok) throw Error(serialized.error);
if (!process.argv[2]) throw Error('Output path required');
writeFileSync(process.argv[2], serialized.value);
console.log(JSON.stringify({ commands: commands.length, turns: state.turn, bytes: serialized.value.length }));
