import { describe, expect, it } from 'vitest';
import {
  applyGameCommand,
  buildBridge,
  createBoard,
  createGameState,
  createScenarioInitialState,
  endTurn,
  isDeployedUnit,
  scenarioById,
  visibleEnemies,
  type GameState,
} from '../game';
import { force, valueOf } from '../game/operations.fixture';
import { chooseBridgeAction, clearBridgeLane, crossingDistance, crossingDistances } from './crossing';
import { chooseCpuAction, cpuDifficultyConfig, createCpuPlanningContext } from './rules';
import { bluePlanningState, rotatePosition } from './perspective';

function field(): GameState {
  const board = createBoard(9, 9);
  for (let y = 1; y < 8; y++) board.terrain[y]![4] = { kind: 'sea' };
  board.terrain[4]![8] = { kind: 'capital', owner: 'blue' };
  return {
    ...createGameState(board),
    ruleVersion: 9,
    units: [force('e', 'engineer', 3, 4), force('t', 'tank', 2, 4)],
    players: { red: { gold: 5000, income: 0 }, blue: { gold: 0, income: 0 } },
  };
}
const targets = [{ x: 8, y: 4 }];

describe('CPU crossing planning', () => {
  it('clears the builder from the approach before the following column moves', () => {
    const built = valueOf(buildBridge(field(), 'e', { x: 4, y: 4 }));
    const state = endTurn(endTurn(built));
    const action = clearBridgeLane(state, 'red', targets, []);
    expect(action).toMatchObject({ type: 'move', unitId: 'e' });
    const next = valueOf(applyGameCommand(state, action!));
    expect(next.units[0]!.position).not.toEqual({ x: 3, y: 4 });
    expect(next.units[0]!.position).not.toEqual({ x: 4, y: 4 });
    expect(next.units[0]!.position).not.toEqual({ x: 5, y: 4 });
    expect(chooseCpuAction(state)).toEqual(action);
  });
  it.each(['old', 'noBridge', 'noTargets', 'moved', 'acted', 'noQueue', 'queueActed', 'holding', 'noRoom', 'behind'] as const)(
    'does not clear a bridge lane for %s',
    (condition) => {
      const state = endTurn(endTurn(valueOf(buildBridge(field(), 'e', { x: 4, y: 4 }))));
      if (condition === 'old') state.ruleVersion = 8;
      if (condition === 'noBridge') state.bridges = [];
      if (condition === 'moved') state.units[0]!.hasMoved = true;
      if (condition === 'acted') state.units[0]!.hasActed = true;
      if (condition === 'noQueue') state.units.pop();
      if (condition === 'queueActed') state.units[1]!.hasActed = true;
      if (condition === 'noRoom') state.units[0]!.fuel = 0;
      expect(
        clearBridgeLane(state, 'red', condition === 'noTargets' ? [] : condition === 'holding' ? [{ x: 3, y: 4 }] : condition === 'behind' ? [{ x: 0, y: 4 }] : targets, []),
      ).toBeUndefined();
    },
  );
  it('keeps route choices unchanged when only an unseen enemy engineer is added', () => {
    const state = field();
    state.units = [force('t', 'tank', 2, 4)];
    const before = crossingDistance(state, 'tank', { x: 3, y: 4 }, targets);
    expect(before).toBe(5);
    expect(crossingDistance({ ...state, units: [...state.units, force('secret', 'engineer', 8, 0, { owner: 'blue' })] }, 'tank', { x: 3, y: 4 }, targets)).toBe(before);
  });
  it('chooses a useful bridge despite an existing detour and applies the same order for blue', () => {
    const state = field();
    expect(chooseBridgeAction(state, 'red', targets, [])).toEqual({ type: 'bridge', unitId: 'e', destination: { x: 4, y: 4 } });
    expect(crossingDistance(state, 'tank', { x: 3, y: 4 }, targets)).toBe(13);
    const next = valueOf(buildBridge(state, 'e', { x: 4, y: 4 }));
    expect(crossingDistance(next, 'tank', { x: 3, y: 4 }, targets)).toBe(5);
    expect(chooseBridgeAction(next, 'red', targets, [])).toBeUndefined();
    state.units.push(force('enemy', 'infantry', 8, 4, { owner: 'blue' }));
    state.recon = { remaining: { red: 0, blue: 0 }, centers: [] };
    const red = chooseCpuAction(state);
    expect(red.type).toBe('bridge');
    const blue = bluePlanningState({
      ...state,
      activePlayer: 'blue',
      players: { red: state.players.blue, blue: state.players.red },
      units: state.units.map((unit) => ({ ...unit, owner: unit.owner === 'red' ? 'blue' : 'red' })),
    });
    blue.board.terrain = blue.board.terrain.map((row) => row.map((tile) => (tile.owner ? { ...tile, owner: tile.owner === 'red' ? 'blue' : 'red' } : tile)));
    expect(chooseCpuAction(blue)).toEqual({ type: 'bridge', unitId: 'e', destination: rotatePosition({ x: 4, y: 4 }, state.board) });
  });
  it('approaches a bank, then constructs on its next turn', () => {
    let state = field();
    state.units[0]!.position = { x: 1, y: 3 };
    const action = chooseBridgeAction(state, 'red', targets, []);
    expect(action?.type).toBe('move');
    state = valueOf(applyGameCommand(state, action!));
    expect(chooseBridgeAction(state, 'red', targets, [])).toBeUndefined();
    state = endTurn(endTurn(state));
    expect(chooseBridgeAction(state, 'red', targets, [])?.type).toBe('bridge');
  });
  it('preserves old routing and handles air, empty or unreachable goals and weighted terrain', () => {
    const state = field();
    expect(crossingDistance({ ...state, ruleVersion: 8 }, 'tank', { x: 3, y: 4 }, targets)).toBe(5);
    expect(crossingDistance(state, 'fighter', { x: 3, y: 4 }, targets)).toBe(5);
    expect(crossingDistance(state, 'tank', { x: 3, y: 4 }, [])).toBe(0);
    expect(crossingDistance({ ...state, board: createBoard(9, 9) }, 'tank', { x: 3, y: 4 }, targets)).toBe(5);
    expect(crossingDistance(state, 'tank', { x: 3, y: 4 }, [{ x: 4, y: 4 }])).toBe(1);
    expect(crossingDistances(state, 'tank', targets)).toBe(crossingDistances(state, 'tank', targets));
    const isolated = structuredClone(state);
    isolated.board.terrain[0]![4] = { kind: 'sea' };
    isolated.board.terrain[8]![4] = { kind: 'sea' };
    expect(crossingDistance(isolated, 'tank', { x: 3, y: 4 }, targets)).toBe(243);
    const weighted = { ...state, board: createBoard(3, 1) };
    weighted.board.terrain[0]![1] = { kind: 'swamp' };
    expect(crossingDistances(weighted, 'tank', [{ x: 2, y: 0 }]).get('0,0')).toBe(4);
  });
  it.each(['old', 'poor', 'limit', 'acted', 'moved', 'noEngineer', 'noTargets', 'noBenefit', 'occupied'] as const)('does not construct for %s', (condition) => {
    const state = field();
    if (condition === 'old') state.ruleVersion = 8;
    if (condition === 'poor') state.players.red.gold = 999;
    if (condition === 'limit') state.bridges = [1, 2].map((y) => ({ owner: 'red', position: { x: 4, y } }));
    if (condition === 'acted') state.units[0]!.hasActed = true;
    if (condition === 'moved') state.units[0]!.hasMoved = true;
    if (condition === 'noEngineer') state.units.shift();
    if (condition === 'occupied') for (let y = 1; y < 8; y++) state.units.push(force(`s${y}`, 'destroyer', 4, y));
    expect(chooseBridgeAction(state, 'red', condition === 'noTargets' ? [] : condition === 'noBenefit' ? [{ x: 0, y: 4 }] : targets, [])).toBeUndefined();
  });
  it('uses only observed opponents and updates transport connectivity after construction', () => {
    const state = field();
    state.board.terrain[0]![4] = { kind: 'sea' };
    state.board.terrain[8]![4] = { kind: 'sea' };
    state.units.push(force('hidden', 'tank', 8, 0, { owner: 'blue', ammo: 0, hp: 1 }));
    const unseen = visibleEnemies(state, 'red');
    expect(unseen).toEqual([]);
    const action = chooseBridgeAction(state, 'red', targets, unseen);
    expect(
      chooseBridgeAction(
        { ...state, units: state.units.map((unit) => (unit.owner === 'blue' ? { ...unit, position: { x: 8, y: 8 }, hp: 100, ammo: 6 } : unit)) },
        'red',
        targets,
        [],
      ),
    ).toEqual(action);
    const before = createCpuPlanningContext(state, 'red', cpuDifficultyConfig.normal).landComponents;
    expect(before.get('3,4')).not.toBe(before.get('5,4'));
    const next = valueOf(applyGameCommand(state, action!));
    const after = createCpuPlanningContext(next, 'red', cpuDifficultyConfig.normal).landComponents;
    expect(after.get('3,4')).toBe(after.get('5,4'));
    expect(createCpuPlanningContext(next, 'red', cpuDifficultyConfig.normal).landComponents).toBe(after);
  });
  it.each(['bridgehead', 'river-withdrawal'])(
    'constructs and crosses legally in %s',
    (id) => {
      let state = createScenarioInitialState(scenarioById(id)!);
      let built = 0,
        crossed = 0;
      for (let step = 0; step < 200 && !state.winner; step++) {
        const action = chooseCpuAction(state, state.activePlayer === 'red' ? 'hard' : 'easy');
        const next = valueOf(applyGameCommand(state, action));
        if (action.type === 'bridge') built++;
        if (action.type === 'move') {
          const before = state.units.find((unit) => unit.id === action.unitId)!;
          const after = next.units.find((unit) => unit.id === action.unitId)!;
          if (isDeployedUnit(before) && isDeployedUnit(after) && ((before.position.x < 9 && after.position.x > 9) || (before.position.x > 9 && after.position.x < 9))) crossed++;
        }
        state = next;
      }
      expect(built).toBeGreaterThan(0);
      expect(crossed).toBeGreaterThan(0);
    },
    30_000,
  );
});
