import { describe, expect, it } from 'vitest';
import { applyGameCommand, createBoard, createGameState, createScenarioInitialState, holdConditionKey, maps, scenarioForState, type GameState, type PlayerId } from '../game';
import { bluePlanningState, rotatePosition } from './perspective';
import { chooseCpuAction, type CpuAction } from './rules';

const swapOwner = (owner: PlayerId | undefined) => (owner === undefined ? undefined : owner === 'red' ? ('blue' as const) : ('red' as const));
function counterpart(state: GameState): GameState {
  const rotated = bluePlanningState(state);
  const snapshot = rotated.scenarioSnapshot!;
  return {
    ...rotated,
    activePlayer: 'blue',
    players: { red: state.players.blue, blue: state.players.red },
    board: { ...rotated.board, terrain: rotated.board.terrain.map((row) => row.map((tile) => ({ ...tile, owner: swapOwner(tile.owner) }))) },
    units: rotated.units.map((unit) => ({ ...unit, owner: swapOwner(unit.owner)! })),
    scenarioSnapshot: {
      ...snapshot,
      board: { ...snapshot.board, cells: snapshot.board.cells.map(([x, y, kind, owner]) => [x, y, kind, swapOwner(owner)]) },
      initialUnits: snapshot.initialUnits.map((unit) => ({ ...unit, owner: swapOwner(unit.owner)! })),
      victoryConditions: snapshot.defeatConditions,
      defeatConditions: snapshot.victoryConditions,
    },
  };
}
function reflected(action: CpuAction, state: GameState): CpuAction {
  if (action.type === 'move' || action.type === 'disembark') return { ...action, destination: rotatePosition(action.destination, state.board) };
  if (action.type === 'produce') return { ...action, factory: rotatePosition(action.factory, state.board) };
  return action;
}

describe('CPU army orientation', () => {
  it('orders produced units numerically so alternating production IDs do not change initiative', () => {
    const board = createBoard(12, 1);
    board.terrain[0]![11] = { kind: 'capital', owner: 'blue', capturePoints: 20 };
    const state = {
      ...createGameState(board),
      units: ['u10', 'u2'].map((id, x) => ({ id, kind: 'infantry' as const, owner: 'red' as const, position: { x, y: 0 }, hp: 100, hasMoved: false, hasActed: false })),
    };
    expect(chooseCpuAction(state, 'normal')).toMatchObject({ type: 'move', unitId: 'u2' });
  });
  it.each(['easy', 'normal', 'hard'] as const)('chooses corresponding legal opening orders for both sides at %s', (difficulty) => {
    for (const scenario of maps.filter((map) => !['tundra', 'landing', 'industrial'].includes(map.id))) {
      let red = createScenarioInitialState(scenario);
      let blue = counterpart(red);
      for (let step = 0; step < 120; step++) {
        const action = chooseCpuAction(red, difficulty);
        const blueAction = chooseCpuAction(blue, difficulty);
        expect(blueAction, scenario.id).toEqual(reflected(action, red));
        if (action.type === 'endTurn') break;
        const redApplied = applyGameCommand(red, action),
          blueApplied = applyGameCommand(blue, blueAction);
        expect(redApplied.ok && blueApplied.ok, scenario.id).toBe(true);
        if (!redApplied.ok || !blueApplied.ok) throw new Error('Illegal opening');
        red = redApplied.value;
        blue = blueApplied.value;
      }
    }
  });

  it('rotates hold objectives and their recorded progress without changing the live state', () => {
    const initial = createScenarioInitialState(maps[0]!);
    const condition = { type: 'hold' as const, positions: [{ x: 3, y: 2 }], turns: 3 };
    const state: GameState = {
      ...initial,
      activePlayer: 'blue',
      scenarioSnapshot: { ...initial.scenarioSnapshot!, defeatConditions: [condition] },
      objectiveHoldTurns: { blue: { [holdConditionKey(condition)]: 2 } },
    };
    const before = structuredClone(state);
    const rotated = bluePlanningState(state);
    const expected = { ...condition, positions: condition.positions.map((position) => rotatePosition(position, state.board)) };
    expect(scenarioForState(rotated)?.defeatConditions).toEqual([expected]);
    expect(rotated.objectiveHoldTurns?.blue?.[holdConditionKey(expected)]).toBe(2);
    expect(state).toEqual(before);
    const restored = bluePlanningState(rotated);
    expect(restored.board).toEqual(state.board);
    expect(restored.units).toEqual(state.units);
    expect(restored.objectiveHoldTurns).toEqual(state.objectiveHoldTurns);
    expect(scenarioForState(restored)?.board).toEqual(scenarioForState(state)?.board);
    expect(scenarioForState(restored)?.defeatConditions).toEqual([condition]);
  });

  it('moves a tank past a neutral factory rather than occupying the infantry objective', () => {
    const board = createBoard(16, 3);
    board.terrain[1]![4] = { kind: 'factory', capturePoints: 20 };
    board.terrain[1]![15] = { kind: 'capital', owner: 'blue', capturePoints: 20 };
    const state = {
      ...createGameState(board),
      units: [{ id: 'tank', kind: 'tank' as const, owner: 'red' as const, position: { x: 3, y: 1 }, hp: 100, hasMoved: false, hasActed: false }],
    };
    const action = chooseCpuAction(state, 'normal');
    expect(action.type).toBe('move');
    expect(action.type === 'move' && action.destination.x).toBeGreaterThan(4);
  });
});
