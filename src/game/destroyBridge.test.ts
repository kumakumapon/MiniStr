import { expect, it } from 'vitest';
import {
  applyGameCommand,
  createScenarioInitialState,
  createReplay,
  parseReplay,
  serializeReplay,
  saveGame,
  parseSavedGame,
  destroyBridge,
  isGameCommand,
  type GameState,
  type GameCommand,
} from './index';
import { operation, force, valueOf } from './operations.fixture';
import { chooseDemolition } from '../ai/demolition';

function initial(): GameState {
  const scenario = operation({
    startingGold: 5000,
    board: { width: 9, height: 9, cells: Array.from({ length: 9 }, (_, y) => [4, y, 'sea']) },
    initialUnits: [
      { kind: 'engineer', owner: 'red', x: 3, y: 4 },
      { kind: 'infantry', owner: 'blue', x: 8, y: 8 },
    ],
    victoryConditions: [{ type: 'hold', positions: [{ x: 3, y: 4 }], turns: 2 }],
    defeatConditions: [{ type: 'eliminate' }],
  });
  return { ...createScenarioInitialState(scenario), ruleVersion: 12 };
}
function ready(): GameState {
  let state = initial();
  for (const command of [{ type: 'bridge', unitId: 'r1', destination: { x: 4, y: 4 } }, { type: 'endTurn' }, { type: 'endTurn' }] as const)
    state = valueOf(applyGameCommand(state, command));
  return state;
}
const command: GameCommand = { type: 'destroyBridge', unitId: 'r1', destination: { x: 4, y: 4 } };
it('removes a crossing without refunds and consumes the engineer action', () => {
  const before = ready();
  const after = valueOf(applyGameCommand(before, command));
  expect(after.bridges).toEqual([]);
  expect(after.players).toEqual(before.players);
  expect(after.units[0]).toMatchObject({ hasMoved: true, hasActed: true });
  expect(before.bridges).toHaveLength(1);
});
it.each(['old', 'moved', 'acted', 'enemy', 'missing', 'occupied', 'finished', 'far'] as const)('rejects %s without mutation', (reason) => {
  const state = ready();
  if (reason === 'old') state.ruleVersion = 11;
  if (reason === 'moved') state.units[0]!.hasMoved = true;
  if (reason === 'acted') state.units[0]!.hasActed = true;
  if (reason === 'enemy') state.activePlayer = 'blue';
  if (reason === 'missing') state.bridges = [];
  if (reason === 'occupied') state.units.push(force('occupant', 'tank', 4, 4));
  if (reason === 'finished') state.winner = 'red';
  if (reason === 'far') state.units[0]!.position = { x: 0, y: 0 };
  const before = structuredClone(state);
  expect(applyGameCommand(state, command).ok).toBe(false);
  expect(state).toEqual(before);
});
it('validates exact command fields and replays and restores a complete demolition history', () => {
  expect(isGameCommand(command)).toBe(true);
  expect(isGameCommand({ ...command, extra: 1 })).toBe(false);
  expect(isGameCommand({ ...command, destination: { x: 4, y: NaN } })).toBe(false);
  const state = initial();
  const commands: GameCommand[] = [{ type: 'bridge', unitId: 'r1', destination: { x: 4, y: 4 } }, { type: 'endTurn' }, { type: 'endTurn' }, command, { type: 'endTurn' }];
  const final = commands.reduce((s, c) => valueOf(applyGameCommand(s, c)), state);
  const replay = valueOf(createReplay({ mapId: state.scenarioId!, difficulty: 'normal', initialState: state, commands }));
  expect(valueOf(parseReplay(valueOf(serializeReplay(replay)))).finalState).toEqual(final);
  const saved = valueOf(
    saveGame({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, 'test', {
      mapId: state.scenarioId!,
      difficulty: 'normal',
      initialState: state,
      gameState: final,
      commands,
    }),
  );
  expect(valueOf(parseSavedGame(JSON.stringify(saved))).gameState).toEqual(final);
});
it('plans against confirmed enemies and preserves nearby friendly crossings', () => {
  const state = ready();
  state.bridges = [{ owner: 'blue', position: { x: 4, y: 4 } }];
  const enemy = force('near', 'tank', 5, 4, { owner: 'blue' });
  state.units.push(enemy);
  expect(chooseDemolition(state, 'red', [])).toBeUndefined();
  expect(chooseDemolition(state, 'red', [enemy])).toEqual(command);
  state.units.push(force('ally', 'infantry', 3, 5));
  expect(chooseDemolition(state, 'red', [enemy])).toBeUndefined();
  expect(destroyBridge({ ...state, ruleVersion: 11 }, 'r1', { x: 4, y: 4 }).ok).toBe(false);
});
