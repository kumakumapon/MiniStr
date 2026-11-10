import { describe, expect, it } from 'vitest';
import { clearMissionExit } from './missionLane';
import { createScenarioInitialState } from '../game/maps';
import { force, operation, valueOf } from '../game/operations.fixture';
import { applyGameCommand } from '../game/session';
import { combinedTactics, initialTactics } from '../game/tactics';
import type { GameState } from '../game/types';
import { missionLaneSafeAt } from './missionSafety';
import { chooseCpuAction } from './rules';

function corridor(chain = false): GameState {
  const tiles = new Set(['0,1', '1,1', '1,0', '7,1', ...(chain ? ['2,0'] : [])]);
  const scenario = operation({
    board: { width: 8, height: 4, cells: Array.from({ length: 32 }, (_, i) => [i % 8, Math.floor(i / 8), tiles.has(`${i % 8},${Math.floor(i / 8)}`) ? 'road' : 'sea']) },
    initialUnits: [
      { kind: 'apc', owner: 'red', x: 0, y: 1 },
      { kind: 'tank', owner: 'red', x: 1, y: 1 },
      ...(chain ? [{ kind: 'tank' as const, owner: 'red' as const, x: 1, y: 0 }] : []),
      { kind: 'tank', owner: 'blue', x: 7, y: 1 },
    ],
    victoryConditions: [{ type: 'escort', unitIds: ['r1'], positions: [{ x: 1, y: 1 }], required: 1 }],
  });
  return { ...createScenarioInitialState(scenario), ruleVersion: 14, tactics: initialTactics(combinedTactics, 1) };
}

describe('same-turn mission exit clearance', () => {
  it.each([false, true])('opens the free end of a blocker chain and evacuates without re-closing it (chain=%s)', (chain) => {
    let state = corridor(chain);
    const original = structuredClone(state);
    const units = [];
    for (let i = 0; i < 30 && !state.winner; i++) {
      const action = chooseCpuAction(state, 'hard');
      if (action.type === 'move' || action.type === 'evacuate') units.push(action.unitId);
      state = valueOf(applyGameCommand(state, action));
    }
    expect(units).toEqual(chain ? ['r3', 'r2', 'r1', 'r1'] : ['r2', 'r1', 'r1']);
    expect(state.winner).toBe('red');
    expect(original.units[0]?.position).toEqual({ x: 0, y: 1 });
  });

  it('does not change old-rule, tactics-OFF, spent, loaded or unreachable cases', () => {
    const state = corridor();
    expect(clearMissionExit({ ...state, ruleVersion: 13 }, 'red', [])).toBeUndefined();
    expect(clearMissionExit({ ...state, tactics: undefined }, 'red', [])).toBeUndefined();
    for (const patch of [{ hasMoved: true }, { hasActed: true }, { fuel: 0 }]) {
      expect(clearMissionExit({ ...state, units: state.units.map((unit) => (unit.id === 'r2' ? { ...unit, ...patch } : unit)) }, 'red', [])).toBeUndefined();
    }
    expect(clearMissionExit({ ...state, units: state.units.map((unit) => (unit.id === 'r1' ? { ...unit, fuel: 0 } : unit)) }, 'red', [])).toBeUndefined();
    const passenger = { ...force('cargo', 'infantry', 0, 0), position: undefined, embarkedIn: 'r1' };
    expect(clearMissionExit({ ...state, units: [...state.units, passenger] }, 'red', [])).toBeUndefined();
  });

  it('leaves capturing and service properties occupied', () => {
    const state = corridor();
    const terrain = state.board.terrain.map((row, y) => row.map((tile, x) => (x === 1 && y === 1 ? { kind: 'city' as const, owner: 'blue' as const, capturePoints: 10 } : tile)));
    expect(clearMissionExit({ ...state, board: { ...state.board, terrain } }, 'red', [])).toBeUndefined();
  });

  it('preserves withdrawal order, spent targets and other mission targets', () => {
    const state = corridor();
    const snapshot = state.scenarioSnapshot!;
    const withdraw = { ...snapshot, victoryConditions: [{ type: 'withdraw' as const, unitIds: ['r1'], positions: [{ x: 1, y: 1 }], required: 1 }] };
    expect(clearMissionExit({ ...state, scenarioSnapshot: withdraw }, 'red', [])).toBeUndefined();
    expect(clearMissionExit({ ...state, units: state.units.map((unit) => (unit.id === 'r1' ? { ...unit, hasMoved: true } : unit)) }, 'red', [])).toBeUndefined();
    expect(clearMissionExit({ ...state, units: state.units.map((unit) => (unit.id === 'r1' ? { ...unit, hasActed: true } : unit)) }, 'red', [])).toBeUndefined();
    const both = { ...snapshot, victoryConditions: [{ type: 'escort' as const, unitIds: ['r1', 'r2'], positions: [{ x: 1, y: 1 }], required: 2 }] };
    expect(clearMissionExit({ ...state, scenarioSnapshot: both }, 'red', [])).toBeUndefined();
  });

  it('keeps a hold post occupied and does nothing without a free safe berth', () => {
    const state = corridor();
    const snapshot = {
      ...state.scenarioSnapshot!,
      victoryConditions: [...state.scenarioSnapshot!.victoryConditions, { type: 'hold' as const, positions: [{ x: 1, y: 1 }], turns: 2 }],
    };
    expect(clearMissionExit({ ...state, scenarioSnapshot: snapshot }, 'red', [])).toBeUndefined();
    const terrain = state.board.terrain.map((row, y) => row.map((tile, x) => (x === 1 && y === 0 ? { kind: 'sea' as const } : tile)));
    expect(clearMissionExit({ ...state, board: { ...state.board, terrain } }, 'red', [])).toBeUndefined();
  });

  it('leaves an open advance to the existing escort planner', () => {
    const state = corridor();
    const units = state.units.map((unit) => (unit.id === 'r2' ? { ...unit, position: { x: 1, y: 0 } } : unit));
    expect(clearMissionExit({ ...state, units }, 'red', [])).toBeUndefined();
  });

  it('does not send a blocker into lethal observed fire', () => {
    const state = corridor();
    const blocker = force('r2', 'infantry', 0, 1, { hp: 10 });
    const enemy = force('b1', 'tank', 1, 1, { owner: 'blue' });
    expect(missionLaneSafeAt({ ...state, units: [blocker, enemy] }, blocker, { x: 1, y: 0 }, [enemy])).toBe(false);
  });

  it('ignores hidden contacts and private enemy resources', () => {
    const state = corridor();
    const expected = clearMissionExit(state, 'red', []);
    const changed = {
      ...state,
      players: { ...state.players, blue: { ...state.players.blue, gold: 99999 } },
      units: state.units.map((unit) => (unit.owner === 'blue' ? { ...unit, position: { x: 1, y: 0 }, fuel: 0, ammo: 0 } : unit)),
    };
    expect(clearMissionExit(changed, 'red', [])).toEqual(expected);
  });
});
