import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { missionGuardsPending, missionSafeAt, usesMissionSafety } from './missionSafety';
import { visibleEnemies } from '../game/fog';
import { createScenarioInitialState, scenarioById } from '../game/maps';
import { force, operation, valueOf } from '../game/operations.fixture';
import { applyGameCommand, type GameCommand } from '../game/session';
import { combinedTactics, initialTactics, weatherAt } from '../game/tactics';
import { tacticalScenario } from '../game/tacticalMaps';
import { isDeployedUnit, type DeployedUnit, type GameState, type Unit } from '../game/types';
import { chooseCpuAction } from './rules';

function army(units: Unit[]): GameState {
  return {
    ...createScenarioInitialState(operation({ victoryConditions: [{ type: 'escort', unitIds: ['r1'], positions: [{ x: 7, y: 0 }], required: 1 }] })),
    ruleVersion: 14,
    tactics: initialTactics(combinedTactics, 1),
    units,
  };
}

const histories = JSON.parse(gunzipSync(readFileSync('docs/reviews/v1.5.1/playthrough.commands.json.gz')).toString()) as Record<string, GameCommand[]>;
function before(id: string, count: number): GameState {
  let state: GameState = { ...createScenarioInitialState(tacticalScenario(scenarioById(id)!)), ruleVersion: 14 };
  for (const command of histories[`${id}/default/hard:easy/authored/outbound`]!.slice(0, count)) state = valueOf(applyGameCommand(state, command));
  return state;
}
function target(state: GameState, id = 'r1'): DeployedUnit {
  const unit = state.units.find((unit) => unit.id === id)!;
  if (!isDeployedUnit(unit)) throw Error('Expected deployed mission target');
  return unit;
}

describe('CPU ground mission safety', () => {
  it('preserves old rules, tactics OFF, ordinary troops and sea/air mission decisions', () => {
    const unit = force('r1', 'apc', 0, 1),
      state = army([unit]);
    expect(usesMissionSafety(state, unit)).toBe(true);
    for (const changed of [
      { ...state, ruleVersion: 13 as const },
      { ...state, tactics: undefined },
      { ...state, tactics: initialTactics({ ...combinedTactics, simultaneous: false, ambush: false, terrain: false, weather: false, zoc: false, submarines: false }, 1) },
    ]) {
      expect(usesMissionSafety(changed, unit)).toBe(false);
      expect(missionSafeAt(changed, unit, { x: 99, y: 99 }, [])).toBe(true);
    }
    expect(usesMissionSafety(state, force('other', 'tank', 0, 1))).toBe(false);
    expect(usesMissionSafety(state, force('r1', 'landingShip', 0, 1))).toBe(false);
    expect(usesMissionSafety(state, force('r1', 'transportHelicopter', 0, 1))).toBe(false);
  });

  it('allows safe advance and staying, rejects unreachable tiles and caches only immutable positions', () => {
    const unit = force('r1', 'apc', 0, 1),
      state = army([unit]);
    expect(missionSafeAt(state, unit, { x: 2, y: 1 }, [])).toBe(true);
    expect(missionSafeAt(state, unit, unit.position, [])).toBe(true);
    expect(missionSafeAt(state, unit, { x: 99, y: 99 }, [])).toBe(false);
    const moved = { ...unit, position: { x: 2, y: 1 }, fuel: 0 };
    const changed = { ...state, units: [moved] };
    expect(missionSafeAt(changed, moved, unit.position, [])).toBe(false);
    expect(missionSafeAt(changed, moved, moved.position, [])).toBe(true);
  });

  it('includes weak confirmed threats after movement instead of ignoring damage below 30 HP', () => {
    const state = before('convoy-escort', 6),
      unit = target(state),
      known = visibleEnemies(state, 'red');
    const snapshot = JSON.stringify(state);
    expect(known.map((unit) => unit.id)).toEqual(['b5']);
    expect(missionSafeAt(state, unit, { x: 4, y: 3 }, known)).toBe(false);
    expect(missionSafeAt(state, unit, unit.position, known)).toBe(true);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(chooseCpuAction(state, 'hard')).not.toEqual({ type: 'move', unitId: 'r1', destination: { x: 4, y: 3 } });
  });

  it('allows confirmed enemies to clear their lanes before striking across a bridge', () => {
    const state = before('river-withdrawal', 45),
      unit = target(state, 'r5'),
      known = visibleEnemies(state, 'red');
    expect(missionSafeAt(state, unit, { x: 9, y: 6 }, known)).toBe(false);
  });

  it('waits for ready ground guards, while excluding spent units and transports', () => {
    const unit = force('r1', 'apc', 0, 1),
      guard = force('guard', 'tank', 1, 1);
    expect(missionGuardsPending(army([unit, guard]), unit)).toBe(true);
    const embarked: Unit = { ...force('cargo', 'infantry', 0, 0), position: undefined, embarkedIn: 'carrier' };
    for (const other of [
      { ...guard, hasMoved: true },
      { ...guard, hasActed: true },
      force('gun', 'artillery', 2, 1),
      force('sea', 'destroyer', 2, 1),
      force('air', 'fighter', 2, 1),
      force('other', 'apc', 2, 1),
      { ...guard, owner: 'blue' as const },
      embarked,
    ]) {
      expect(missionGuardsPending(army([unit, other]), unit)).toBe(false);
    }
    expect(missionGuardsPending(army([guard]), guard)).toBe(false);
  });

  it('protects only the nearest required withdrawal survivors, accounting for cargo and escaped units', () => {
    const scenario = operation({ victoryConditions: [{ type: 'withdraw', unitIds: ['r1', 'r2', 'r3'], positions: [{ x: 7, y: 0 }], required: 1 }] });
    const unit = force('r1', 'apc', 1, 1),
      other = force('r2', 'infantry', 6, 0);
    const state: GameState = { ...army([unit, other]), scenarioSnapshot: undefined, scenarioId: scenario.id };
    const base = { ...createScenarioInitialState(scenario), ruleVersion: 14 as const, tactics: state.tactics, units: [unit, other] };
    expect(usesMissionSafety(base, unit)).toBe(false);
    expect(usesMissionSafety({ ...base, units: [unit] }, unit)).toBe(true);
    expect(usesMissionSafety({ ...base, units: [unit], evacuatedUnits: [other] }, unit)).toBe(false);
    const cargo: Unit = { ...other, position: undefined, embarkedIn: 'carrier' };
    expect(usesMissionSafety({ ...base, units: [unit, cargo, force('carrier', 'landingShip', 6, 0)] }, unit)).toBe(false);
    expect(usesMissionSafety({ ...base, units: [unit, cargo] }, unit)).toBe(true);
    expect(usesMissionSafety(base, force('r3', 'infantry', 0, 0))).toBe(false);
  });

  it('lets a rearward withdrawal lead its guards, while forward exits still wait for cover', () => {
    const unit = force('r1', 'apc', 4, 1),
      guard = force('guard', 'tank', 5, 1);
    for (const [exit, pending] of [
      [{ x: 0, y: 2 }, false],
      [{ x: 7, y: 0 }, true],
    ] as const) {
      const scenario = operation({
        board: { width: 8, height: 4, cells: [[0, 3, 'capital', 'red']] },
        victoryConditions: [{ type: 'withdraw', unitIds: ['r1'], positions: [exit], required: 1 }],
      });
      const state: GameState = { ...createScenarioInitialState(scenario), ruleVersion: 14, tactics: initialTactics(combinedTactics, 1), units: [unit, guard] };
      expect(missionGuardsPending(state, unit)).toBe(pending);
    }
  });

  it('allows nonlethal progress when an armoured escort screens it or the exit is one move away', () => {
    const unit = force('r1', 'apc', 0, 1),
      enemy = force('enemy', 'tank', 7, 2, { owner: 'blue' });
    const long = operation({ board: { width: 16, height: 8, cells: [] }, victoryConditions: [{ type: 'escort', unitIds: ['r1'], positions: [{ x: 15, y: 0 }], required: 1 }] });
    const state: GameState = { ...createScenarioInitialState(long), ruleVersion: 14, tactics: initialTactics(combinedTactics, 1), units: [unit, enemy] };
    const destination = { x: 4, y: 1 };
    expect(missionSafeAt(state, unit, destination, [enemy])).toBe(false);
    expect(missionSafeAt(state, unit, destination, [enemy])).toBe(false);
    expect(missionSafeAt({ ...state, units: [unit, enemy, force('guard', 'tank', 4, 2)] }, unit, destination, [enemy])).toBe(true);
    expect(missionSafeAt({ ...state, units: [unit, enemy, force('guard', 'tank', 4, 3)] }, unit, destination, [enemy])).toBe(false);
    expect(missionSafeAt(army([unit, enemy]), unit, destination, [enemy])).toBe(true);
    expect(missionSafeAt({ ...state, units: [unit, { ...enemy, hp: 10 }] }, unit, destination, [{ ...enemy, hp: 10 }])).toBe(true);
  });

  it('does not let an indirect weapon fire after moving and forecasts blue on the following round', () => {
    const unit = force('r1', 'apc', 0, 1),
      enemy = force('enemy', 'artillery', 7, 3, { owner: 'blue' });
    const long = operation({ board: { width: 16, height: 8, cells: [] }, victoryConditions: [{ type: 'escort', unitIds: ['r1'], positions: [{ x: 15, y: 0 }], required: 1 }] });
    const state: GameState = { ...createScenarioInitialState(long), ruleVersion: 14, tactics: initialTactics(combinedTactics, 1), units: [unit, enemy] };
    expect(missionSafeAt(state, unit, { x: 4, y: 1 }, [enemy])).toBe(true);
    const stationary = { ...enemy, position: { x: 6, y: 1 } };
    expect(missionSafeAt({ ...state, units: [unit, stationary] }, unit, { x: 4, y: 1 }, [stationary])).toBe(false);
    const blueUnit = { ...unit, id: 'b1', owner: 'blue' as const },
      redEnemy = force('enemy', 'tank', 7, 2);
    const blueScenario = operation({
      board: { width: 16, height: 8, cells: [] },
      defeatConditions: [{ type: 'escort', unitIds: ['b1'], positions: [{ x: 15, y: 0 }], required: 1 }],
    });
    const blue: GameState = { ...createScenarioInitialState(blueScenario), activePlayer: 'blue', ruleVersion: 14, tactics: state.tactics, units: [blueUnit, redEnemy] };
    expect(missionSafeAt(blue, blueUnit, { x: 4, y: 1 }, [redEnemy])).toBe(false);
  });

  it('deducts the planned move from own fuel before allowing a next-turn escape', () => {
    const unit = force('r1', 'apc', 0, 1, { fuel: 5 }),
      enemy = force('enemy', 'tank', 7, 2, { owner: 'blue' });
    const state = army([unit, enemy]);
    expect(missionSafeAt(state, unit, { x: 4, y: 1 }, [enemy])).toBe(false);
    const refuelled = { ...unit, fuel: 20 };
    expect(missionSafeAt({ ...state, units: [refuelled, enemy] }, refuelled, { x: 4, y: 1 }, [enemy])).toBe(true);
    const implicitFuel = { ...unit, fuel: undefined };
    expect(missionSafeAt({ ...state, units: [implicitFuel, enemy] }, implicitFuel, { x: 4, y: 1 }, [enemy])).toBe(true);
  });

  it('uses next-round weather when checking visibility and ZOC along the further escape route', () => {
    const scenario = operation({
      board: {
        width: 8,
        height: 4,
        cells: Array.from({ length: 32 }, (_, i): [number, number, 'road' | 'plain' | 'sea'] => [
          i % 8,
          Math.floor(i / 8),
          Math.floor(i / 8) === 1 ? 'road' : i === 22 ? 'plain' : 'sea',
        ]),
      },
      initialUnits: [
        { kind: 'apc', owner: 'red', x: 0, y: 1 },
        { kind: 'mech', owner: 'blue', x: 6, y: 2 },
      ],
      victoryConditions: [{ type: 'escort', unitIds: ['r1'], positions: [{ x: 7, y: 1 }], required: 1 }],
      defeatConditions: [{ type: 'eliminate' }],
    });
    const base: GameState = { ...createScenarioInitialState(scenario), ruleVersion: 14, turn: 2 };
    for (const next of ['clear', 'rain'] as const) {
      const seed = Array.from({ length: 100 }, (_, i) => i + 1).find((seed) => {
        const state = { ...base, tactics: initialTactics(combinedTactics, seed) };
        return weatherAt(state) === 'clear' && weatherAt(state, 3) === next;
      })!;
      const state = { ...base, tactics: initialTactics(combinedTactics, seed) };
      expect(missionSafeAt(state, target(state), { x: 4, y: 1 }, [target(state, 'b1')])).toBe(next === 'rain');
    }
  });

  it('does not consult private enemy resources, orders, funds or reveal reservations', () => {
    const state = before('convoy-escort', 6),
      unit = target(state),
      known = visibleEnemies(state, 'red');
    const changed: GameState = {
      ...state,
      players: { ...state.players, blue: { gold: 999999, income: 99999 } },
      repairReserve: { blue: 999999 },
      tactics: { ...state.tactics!, revealed: { ...state.tactics!.revealed, blue: state.units.map((unit) => unit.id) } },
      units: state.units.map((enemy) =>
        enemy.owner === 'blue'
          ? { ...enemy, fuel: 0, ammo: 0, secondaryAmmo: 0, supplyStock: 0, logistics: { priority: true, resource: 'fuel', repair: false }, hasMoved: true, hasActed: true }
          : enemy,
      ),
    };
    const privateKnown = known.map((enemy) => changed.units.find((unit) => unit.id === enemy.id)!);
    expect(missionSafeAt(changed, unit, { x: 4, y: 3 }, privateKnown)).toBe(missionSafeAt(state, unit, { x: 4, y: 3 }, known));
  });

  it('keeps unseen contacts out of both risk and movement previews', () => {
    const unit = force('r1', 'apc', 0, 1),
      hidden = force('hidden', 'tank', 7, 3, { owner: 'blue' });
    const state = army([unit, hidden]);
    expect(visibleEnemies(state, 'red')).toEqual([]);
    expect(missionSafeAt(state, unit, { x: 2, y: 1 }, [])).toBe(true);
    expect(missionSafeAt({ ...state, units: [unit] }, unit, { x: 2, y: 1 }, [])).toBe(true);
  });

  it('ignores friendly and embarked entries, distant contacts and unarmed transports', () => {
    const unit = force('r1', 'apc', 0, 1),
      state = army([unit]);
    const embarked: Unit = { ...force('cargo', 'infantry', 0, 0, { owner: 'blue' }), position: undefined, embarkedIn: 'transport' };
    const known = [unit, embarked, force('distant', 'tank', 100, 100, { owner: 'blue' }), force('transport', 'transportHelicopter', 4, 1, { owner: 'blue' })];
    expect(missionSafeAt(state, unit, { x: 2, y: 1 }, known)).toBe(true);
    expect(missionSafeAt(state, unit, { x: 2, y: 1 }, [])).toBe(true);
  });

  it('still immediately evacuates from a reachable exit, despite known danger', () => {
    const unit = force('r1', 'apc', 6, 0),
      enemy = force('enemy', 'tank', 7, 1, { owner: 'blue' });
    const state = army([unit, enemy]);
    expect(chooseCpuAction(state, 'hard')).toEqual({ type: 'move', unitId: 'r1', destination: { x: 7, y: 0 } });
    const moved = valueOf(applyGameCommand(state, { type: 'move', unitId: 'r1', destination: { x: 7, y: 0 } }));
    expect(chooseCpuAction(moved, 'hard')).toEqual({ type: 'evacuate', unitId: 'r1' });
  });
});
