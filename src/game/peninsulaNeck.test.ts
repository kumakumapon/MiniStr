import { expect, it } from 'vitest';
import { chooseCpuAction } from '../ai/rules';
import { applyGameCommand, createScenarioInitialState, scenarioById, tacticalScenario, type GameCommand, type GameState } from './index';
import { LOGISTICS_RULE_VERSION } from './logisticsOrders';
import { peninsulaNeckId } from './peninsulaNeck';
import type { GameResult } from './types';

const unwrap = <T>(result: GameResult<T>): T => {
  if (!result.ok) throw Error(result.error);
  return result.value;
};

it.each([false, true])('preserves one land neck, two ports and the mainland airfield (tactics=%s)', (tactics) => {
  const source = scenarioById(peninsulaNeckId)!;
  const { board, initialUnits } = tactics ? tacticalScenario(source) : source;
  expect(board).toMatchObject({ width: 18, height: 12 });
  expect(board.terrain.map((row) => row[7]!.kind).filter((kind) => kind !== 'sea')).toEqual(['city', 'mountain']);
  const owned = (owner: 'red' | 'blue', kind: string) => board.terrain.flat().filter((tile) => tile.owner === owner && tile.kind === kind);
  expect(owned('red', 'port')).toHaveLength(2);
  expect(owned('red', 'factory')).toHaveLength(1);
  expect(owned('blue', 'factory')).toHaveLength(2);
  expect(owned('blue', 'airport')).toHaveLength(1);
  expect(initialUnits).toEqual(
    expect.arrayContaining([expect.objectContaining({ owner: 'red', kind: 'landingShip' }), expect.objectContaining({ owner: 'blue', kind: 'transportHelicopter' })]),
  );
  expect(source.defeatConditions).toEqual(source.victoryConditions);
});

it('crosses to the mainland by ship and the peninsula by transport helicopter without using the road', () => {
  const initial: GameState = { ...createScenarioInitialState(scenarioById(peninsulaNeckId)!), ruleVersion: LOGISTICS_RULE_VERSION };
  const locate = (kind: string, owner: string, x?: number) =>
    initial.units.find((unit) => unit.kind === kind && unit.owner === owner && (x === undefined || unit.position?.x === x))!.id;
  const ship = locate('landingShip', 'red');
  const helicopter = locate('transportHelicopter', 'blue');
  const red = locate('infantry', 'red', 3);
  const blue = locate('infantry', 'blue', 13);
  const actions: GameCommand[] = [
    { type: 'embark', unitId: red, transportId: ship },
    { type: 'endTurn' },
    { type: 'embark', unitId: blue, transportId: helicopter },
    { type: 'endTurn' },
    { type: 'move', unitId: ship, destination: { x: 6, y: 2 } },
    { type: 'endTurn' },
    { type: 'move', unitId: helicopter, destination: { x: 10, y: 3 } },
    { type: 'endTurn' },
    { type: 'move', unitId: ship, destination: { x: 8, y: 1 } },
    { type: 'disembark', transportId: ship, destination: { x: 9, y: 1 } },
    { type: 'endTurn' },
    { type: 'move', unitId: helicopter, destination: { x: 6, y: 3 } },
    { type: 'disembark', transportId: helicopter, destination: { x: 5, y: 3 } },
  ];
  const after = actions.reduce((state, command) => unwrap(applyGameCommand(state, command)), initial);
  expect(after.units.find((unit) => unit.id === red)?.position).toEqual({ x: 9, y: 1 });
  expect(after.units.find((unit) => unit.id === blue)?.position).toEqual({ x: 5, y: 3 });
});

it('uses a legal coastal landing in the CPU opening even though the road connects the shores', () => {
  const initial: GameState = { ...createScenarioInitialState(scenarioById(peninsulaNeckId)!), ruleVersion: LOGISTICS_RULE_VERSION };
  let state = initial;
  let landed = false;
  for (let actions = 0; actions < 80 && !landed && state.turn < 5; actions++) {
    const command = state.activePlayer === 'red' ? chooseCpuAction(state, 'normal') : { type: 'endTurn' as const };
    const applied = unwrap(applyGameCommand(state, command));
    landed = command.type === 'disembark' && command.destination.x >= 9;
    state = applied;
  }
  expect(landed).toBe(true);
});
