import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { defensiveServiceWait } from './recovery';
import { chooseCpuAction } from './rules';
import { createScenarioInitialState, scenarioById } from '../game/maps';
import { force, valueOf } from '../game/operations.fixture';
import { applyGameCommand, type GameCommand } from '../game/session';
import { endTurn } from '../game/commands';
import { evaluationScenario } from '../../scripts/tacticsV151Scenario';
import type { GameState } from '../game/types';

const histories = JSON.parse(gunzipSync(readFileSync('docs/reviews/v1.5.4/after-fresh.jsonl.commands.json.gz')).toString()) as Record<string, GameCommand[]>;
const commands = histories['convoy-escort/default/hard:easy/15422/outbound']!;
const initial = (): GameState => ({ ...createScenarioInitialState(evaluationScenario(scenarioById('convoy-escort')!, 'default', 15422)), ruleVersion: 14 });
function atRepair(): GameState {
  return commands.slice(0, 191).reduce((state, command) => valueOf(applyGameCommand(state, command)), initial());
}

it('balanced escort completes another affordable repair turn instead of leaving at HP35', () => {
  const state = atRepair(),
    snapshot = JSON.stringify(state);
  expect(state.units.find((unit) => unit.id === 'r1')?.hp).toBe(35);
  const action = chooseCpuAction(state, 'hard');
  expect(action).toEqual({ type: 'wait', unitId: 'r1' });
  const repaired = endTurn(endTurn(valueOf(applyGameCommand(state, action))));
  expect(repaired.units.find((unit) => unit.id === 'r1')?.hp).toBe(55);
  expect(JSON.stringify(state)).toBe(snapshot);
});

it('does not wait without money or compatible friendly repair terrain', () => {
  const state = atRepair();
  const poor = { ...state, players: { ...state.players, red: { ...state.players.red, gold: 0, income: 0 } } };
  expect(defensiveServiceWait(poor, 'red', [], 'r1')).toBeUndefined();
  const terrain = state.board.terrain.map((row, y) => row.map((tile, x) => (x === 0 && y === 9 ? { kind: 'capital' as const, owner: 'blue' as const } : tile)));
  expect(defensiveServiceWait({ ...state, board: { ...state.board, terrain } }, 'red', [], 'r1')).toBeUndefined();
});

it('preserves withdrawal, old-rule and tactics-OFF mission exclusions', () => {
  const state = atRepair();
  const snapshot = { ...state.scenarioSnapshot!, victoryConditions: [{ type: 'withdraw' as const, unitIds: ['r1'], positions: [{ x: 11, y: 5 }], required: 1 }] };
  for (const variant of [
    { ...state, scenarioSnapshot: snapshot },
    { ...state, ruleVersion: 13 as const },
    { ...state, tactics: undefined },
  ])
    expect(defensiveServiceWait(variant, 'red', [], 'r1')).toBeUndefined();
});

it('does not hold healthy, spent or loaded targets for repair', () => {
  const state = atRepair();
  for (const patch of [{ hp: 50 }, { hasMoved: true }, { hasActed: true }]) {
    const variant = { ...state, units: state.units.map((unit) => (unit.id === 'r1' ? { ...unit, ...patch } : unit)) };
    expect(defensiveServiceWait(variant, 'red', [], 'r1')).toBeUndefined();
  }
  const cargo = { ...force('cargo', 'infantry', 0, 0), position: undefined, embarkedIn: 'r1' };
  expect(defensiveServiceWait({ ...state, units: [...state.units, cargo] }, 'red', [], 'r1')).toBeUndefined();
});

it('does not force repair in observed lethal fire', () => {
  const state = atRepair();
  const enemy = force('nearby', 'tank', 1, 9, { owner: 'blue' });
  const exposed = { ...state, units: [...state.units.filter((unit) => unit.position?.x !== 1 || unit.position?.y !== 9), enemy] };
  expect(defensiveServiceWait(exposed, 'red', [enemy], 'r1')).toBeUndefined();
});

it('evacuates immediately when the target is already at its exit', () => {
  const state = atRepair();
  const snapshot = { ...state.scenarioSnapshot!, victoryConditions: [{ type: 'escort' as const, unitIds: ['r1'], positions: [{ x: 0, y: 9 }], required: 1 }] };
  expect(chooseCpuAction({ ...state, scenarioSnapshot: snapshot }, 'hard')).toEqual({ type: 'evacuate', unitId: 'r1' });
});

it('keeps the decision independent of enemy private logistics', () => {
  const state = atRepair();
  const changed = {
    ...state,
    players: { ...state.players, blue: { ...state.players.blue, gold: 99999 } },
    units: state.units.map((unit) => (unit.owner === 'blue' ? { ...unit, ammo: 0, fuel: 0, supplyStock: 0 } : unit)),
  };
  expect(chooseCpuAction(changed, 'hard')).toEqual(chooseCpuAction(state, 'hard'));
});
