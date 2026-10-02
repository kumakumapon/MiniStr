import { describe, expect, it } from 'vitest';
import { applyGameCommand, createBoard, createGameState, createScenarioInitialState, loadScenarioDefinitions, type GameState, type ScenarioData } from '../game';
import { chooseCpuAction, explainCpuAction } from './rules';

const unit = (id: string, kind: GameState['units'][number]['kind'], x: number, hp = 100): GameState['units'][number] => ({
  id,
  kind,
  owner: 'red',
  position: { x, y: 0 },
  hp,
  hasMoved: false,
  hasActed: false,
});
describe('objective and logistics coordination', () => {
  it('merges badly damaged peers legally instead of adding congestion', () => {
    const state = createGameState(createBoard(4, 1));
    state.units = [unit('r1', 'tank', 0, 40), unit('r2', 'tank', 1, 30)];
    const action = chooseCpuAction(state);
    expect(action).toEqual({ type: 'merge', unitId: 'r1', targetId: 'r2' });
    const applied = applyGameCommand(state, action);
    expect(applied.ok && applied.value.units[0]?.hp).toBe(70);
    expect(chooseCpuAction({ ...state, units: [unit('r1', 'tank', 0, 80), unit('r2', 'tank', 1, 80)] }).type).not.toBe('merge');
  });
  it('embarks, carries and unloads a land passenger toward an objective', () => {
    let state = { ...createGameState(createBoard(12, 2)), ruleVersion: 3 as const };
    state.board.terrain[0]![11] = { kind: 'capital', owner: 'blue' };
    state.units = [unit('r1', 'apc', 1), unit('r2', 'infantry', 0), { ...unit('b1', 'infantry', 11), owner: 'blue', position: { x: 11, y: 1 } }];
    const orders: string[] = [];
    for (let i = 0; i < 16; i++) {
      const action = state.activePlayer === 'red' ? chooseCpuAction(state) : { type: 'endTurn' as const };
      orders.push(action.type);
      const applied = applyGameCommand(state, action);
      if (!applied.ok) throw Error(applied.error);
      state = applied.value as typeof state;
      if (action.type === 'disembark') break;
    }
    expect(orders[0]).toBe('embark');
    expect(orders).toContain('move');
    expect(orders).toContain('disembark');
    expect(state.units.find((unit) => unit.id === 'r2')?.embarkedIn).toBeUndefined();
  });
  it('completes a hold objective while the opposing survival force guards its base', () => {
    const source: ScenarioData = {
      id: 'hold-fixture',
      name: 'Hold',
      briefing: '',
      startingGold: 0,
      board: { width: 5, height: 1, cells: [[4, 0, 'capital', 'blue']] },
      initialUnits: [
        { kind: 'recon', owner: 'red', x: 0, y: 0 },
        { kind: 'infantry', owner: 'blue', x: 4, y: 0 },
      ],
      victoryConditions: [{ type: 'hold', positions: [{ x: 2, y: 0 }], turns: 2 }],
      defeatConditions: [{ type: 'survive', untilTurn: 20 }],
    };
    const parsed = loadScenarioDefinitions([source]);
    if (!parsed.ok) throw Error(parsed.error);
    let state = createScenarioInitialState(parsed.value[0]!);
    for (let i = 0; i < 20 && !state.winner; i++) {
      const action = chooseCpuAction(state);
      const result = applyGameCommand(state, action);
      if (!result.ok) throw Error(result.error);
      state = result.value;
    }
    expect(state.winner).toBe('red');
  });
  it('explains an order from observable data with a stable evaluation', () => {
    const state = { ...createGameState(createBoard(8, 1)), ruleVersion: 3 as const };
    state.board.terrain[0]![7] = { kind: 'capital', owner: 'blue' };
    state.units = [unit('r1', 'infantry', 0)];
    const trace = explainCpuAction(state);
    expect(trace.action).toEqual(chooseCpuAction(state));
    expect(trace.evaluation?.distanceToGoal).toBeLessThan(7);
    expect(Number.isFinite(trace.evaluation?.total)).toBe(true);
    expect(explainCpuAction({ ...state, winner: 'red' }).action.type).toBe('endTurn');
  });
});
