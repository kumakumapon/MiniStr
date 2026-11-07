import { describe, expect, it } from 'vitest';
import { createBoard, createGameState } from './state';
import { applyModernUpkeep } from './logistics';
import { defaultLogisticsOrder, setLogisticsOrder, setRepairReserve } from './logisticsOrders';
import { saveGame, parseSavedGame, isGameCommand, isGameState, applyGameCommand, replayCommands } from './session';
import { createReplay, serializeReplay, parseReplay } from './replay';
import { supplyFromStock } from './supplyStock';
import { observedEnemy } from './fog';
import { operationScenarios, createScenarioInitialState } from './maps';
import { chooseCpuAction } from '../ai/rules';
import type { GameCommand } from './session';
import type { GameState, Unit } from './types';

const unit = (id: string, kind: Unit['kind'], x: number, y: number): Unit => ({
  id,
  kind,
  owner: 'red',
  hp: 60,
  position: { x, y },
  hasMoved: false,
  hasActed: false,
  ammo: 0,
  fuel: 0,
});
function fixture(): GameState {
  const state = { ...createGameState(createBoard(8, 6)), ruleVersion: 14 as const };
  state.units = [unit('r1', 'tank', 2, 2), unit('r2', 'artillery', 3, 3), { ...unit('r3', 'apc', 3, 2), supplyStock: 20 }];
  state.players.red.gold = 1000;
  return state;
}

describe('logistics orders', () => {
  it('allocates scarce supplies to priority recipient without mutating original', () => {
    const before = fixture();
    const order = setLogisticsOrder(before, 'r2', { ...defaultLogisticsOrder, priority: true });
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    const after = applyModernUpkeep(order.value, 'red', false);
    expect(after.units.find((u) => u.id === 'r2')!.ammo).toBe(2);
    expect(after.units.find((u) => u.id === 'r1')!.ammo).toBe(0);
    expect(before.units[1]!.logistics).toBeUndefined();
    expect(before.units[2]!.supplyStock).toBe(20);
  });
  it('can put fuel before both magazines, with legacy ammo-first unchanged', () => {
    const state = fixture(),
      target = { ...state.units[0]!, logistics: { ...defaultLogisticsOrder, resource: 'fuel' as const } };
    expect(supplyFromStock(state, target, 20).unit).toMatchObject({ fuel: 20, ammo: 0 });
    expect(supplyFromStock({ ruleVersion: 13 }, target, 20).unit).toMatchObject({ fuel: 0, ammo: 2 });
  });
  it('respects repair holds and reserves without blocking free resupply', () => {
    let state = fixture();
    state.board.terrain[2]![2] = { kind: 'city', owner: 'red' };
    state = { ...state, repairReserve: { red: 600 } };
    expect(applyModernUpkeep(state, 'red', false).units[0]!.hp).toBe(60); // tank step costs 700
    const held = setLogisticsOrder(state, 'r1', { ...defaultLogisticsOrder, repair: false });
    if (!held.ok) throw Error(held.error);
    const after = applyModernUpkeep(held.value, 'red', false);
    expect(after.units[0]!.hp).toBe(60);
    expect(after.units[0]!.ammo).toBeGreaterThan(0);
    expect(after.players.red.gold).toBe(1000);
    const low = applyModernUpkeep({ ...state, repairReserve: { red: 0 } }, 'red', false);
    expect(low.units[0]!.hp).toBeGreaterThan(60);
    expect(low.players.red.gold).toBeGreaterThanOrEqual(0);
  });
  it('rejects malformed, enemy, finished and legacy orders and strips enemy preferences', () => {
    const state = fixture();
    expect(setLogisticsOrder({ ...state, activePlayer: 'blue' }, 'r1', defaultLogisticsOrder).ok).toBe(false);
    expect(setLogisticsOrder({ ...state, winner: 'red' }, 'r1', defaultLogisticsOrder).ok).toBe(false);
    expect(setRepairReserve({ ...state, ruleVersion: 13 }, 500).ok).toBe(false);
    for (const amount of [-1, 0.5, NaN, 1000001]) expect(setRepairReserve(state, amount).ok).toBe(false);
    expect(isGameCommand({ type: 'logistics', unitId: 'r1', order: { ...defaultLogisticsOrder, priority: 'true' } })).toBe(false);
    expect(isGameCommand({ type: 'repairReserve', amount: 500, extra: true })).toBe(false);
    const changed = setLogisticsOrder(state, 'r1', defaultLogisticsOrder);
    if (!changed.ok) throw Error(changed.error);
    expect(isGameState(changed.value)).toBe(true);
    expect(isGameState({ ...changed.value, ruleVersion: 13 })).toBe(false);
    expect(observedEnemy(changed.value.units[0]!).logistics).toBeUndefined();
  });
  it('replays settings and upkeep exactly across JSON, and old states remain valid', () => {
    const state = fixture();
    const commands = [
      { type: 'logistics' as const, unitId: 'r2', order: { ...defaultLogisticsOrder, priority: true } },
      { type: 'repairReserve' as const, amount: 500 },
      { type: 'endTurn' as const },
      { type: 'endTurn' as const },
    ];
    const replay = replayCommands(state, commands);
    let current = state;
    for (const c of JSON.parse(JSON.stringify(commands))) {
      const result = applyGameCommand(current, c);
      if (!result.ok) throw Error(result.error);
      current = result.value;
    }
    expect(replay).toEqual({ ok: true, value: current });
    expect(isGameState({ ...state, ruleVersion: 13 })).toBe(true);
  });
  it('round-trips an actual scenario through saved games and exported replays', () => {
    const map = operationScenarios.find((s) => s.id === 'tactics-logistics')!;
    const initialState = createScenarioInitialState(map);
    const commands: GameCommand[] = [
      { type: 'logistics' as const, unitId: 'r3', order: { ...defaultLogisticsOrder, priority: true } },
      { type: 'repairReserve' as const, amount: 1000 },
    ];
    let result = replayCommands(initialState, commands);
    if (!result.ok) throw Error(result.error);
    while (!result.value.winner && result.value.turn <= 30 && commands.length < 3000) {
      const state = result.value;
      const command = chooseCpuAction(state, state.activePlayer === 'red' ? 'hard' : 'easy');
      commands.push(command);
      result = applyGameCommand(state, command);
      if (!result.ok) throw Error(result.error);
    }
    expect(result.value.winner).toBe('red');
    let raw = '';
    const saved = saveGame(
      {
        getItem: () => raw,
        setItem: (_key, value) => {
          raw = value;
        },
        removeItem: () => {},
      },
      'test',
      { mapId: map.id, difficulty: 'easy', initialState, gameState: result.value, commands },
    );
    expect(saved.ok).toBe(true);
    const restored = parseSavedGame(raw);
    if (!restored.ok) throw Error(restored.error);
    expect(restored.value.gameState).toEqual(result.value);
    const replay = createReplay({ mapId: map.id, difficulty: 'easy', initialState, commands });
    if (!replay.ok) throw Error(replay.error);
    const serialized = serializeReplay(replay.value);
    if (!serialized.ok) throw Error(serialized.error);
    const imported = parseReplay(serialized.value);
    if (!imported.ok) throw Error(imported.error);
    expect(imported.value.finalState).toEqual(result.value);
  });
  it('runs the new operation legally to an objective victory with CPU orders', () => {
    const map = operationScenarios.find((s) => s.id === 'tactics-logistics')!;
    let state = createScenarioInitialState(map);
    let commands = 0;
    while (!state.winner && !state.draw && state.turn <= 30 && commands < 5000) {
      const command = chooseCpuAction(state, state.activePlayer === 'red' ? 'hard' : 'easy', state.activePlayer);
      const next = applyGameCommand(state, command);
      if (!next.ok) throw Error(`${command.type}: ${next.error}`);
      state = next.value;
      commands++;
    }
    expect(state.winner).toBe('red');
    const needy = fixture();
    const command = chooseCpuAction(needy, 'normal', 'red');
    expect(command.type).toBe('logistics');
    const assigned = applyGameCommand(needy, command);
    expect(assigned.ok).toBe(true);
  });
});
