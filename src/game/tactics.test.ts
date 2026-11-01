import { describe, expect, it } from 'vitest';
import { chooseCpuAction } from '../ai/rules';
import { createBoard, createGameState } from './state';
import { attackUnit, disembarkUnit, endTurn, moveUnit, reachablePositionsForPlayer } from './commands';
import { forecastCombat, effectiveTerrainReduction } from './combat';
import { visibleEnemies, visiblePositions } from './fog';
import { prepareAmbush, toggleDive } from './tacticalActions';
import { combinedTactics, initialTactics, validTacticalState, weatherAt } from './tactics';
import { applyGameCommand, isGameState } from './session';
import { tacticalScenario } from './tacticalMaps';
import { createScenarioInitialState, maps, scenarioDefinitionToData } from './maps';
import { nextRandom } from './rng';
import { unitStats } from './units';
import type { GameResult, GameState, PlayerId, Unit, UnitKind } from './types';

const ok = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
function unit(kind: UnitKind, owner: PlayerId, x: number, y: number, id = owner === 'red' ? 'r1' : 'b1'): Unit {
  return { id, kind, owner, position: { x, y }, hp: 100, ammo: unitStats[kind].ammo, fuel: unitStats[kind].fuel, hasMoved: false, hasActed: false };
}
function state(units: Unit[]): GameState {
  return { ...createGameState(createBoard(9, 6, { kind: 'road' }), 9), ruleVersion: 13, units, tactics: initialTactics({ ...combinedTactics }, 1) };
}

describe('v1.4 tactical combat and movement', () => {
  it('resolves lethal simultaneous return fire and a terminal draw without a turn tiebreaker', () => {
    const s = state([
      { ...unit('infantry', 'red', 1, 2), hp: 1 },
      { ...unit('infantry', 'blue', 2, 2), hp: 1 },
    ]);
    expect(ok(forecastCombat(s, s.units[0]!, s.units[1]!)).simultaneous).toBe(true);
    const next = ok(attackUnit(s, 'r1', 'b1'));
    expect(next.units).toHaveLength(0);
    expect(next.draw).toBe(true);
    expect(next.winner).toBeUndefined();
    expect(next.rngSeed).toBe(nextRandom(nextRandom(s.rngSeed).seed).seed);
    expect(applyGameCommand(next, { type: 'endTurn' }).ok).toBe(false);
    expect(endTurn(next)).toBe(next);
  });
  it('keeps v12 sequential counter damage', () => {
    const current = state([unit('tank', 'red', 1, 2), unit('tank', 'blue', 2, 2)]);
    const old = { ...current, tactics: undefined, ruleVersion: 12 as const };
    expect(ok(forecastCombat(current, current.units[0]!, current.units[1]!)).damageToAttacker).toBeGreaterThan(
      ok(forecastCombat(old, old.units[0]!, old.units[1]!)).damageToAttacker,
    );
  });
  it('fires a reserved shot at an unseen real contact, spends actual route fuel and gives no automatic counter', () => {
    let s = state([unit('tank', 'red', 0, 2), unit('infantry', 'blue', 5, 2)]);
    s = { ...ok(prepareAmbush({ ...s, activePlayer: 'blue' }, 'b1')), activePlayer: 'red' };
    const next = ok(moveUnit(s, 'r1', { x: 5, y: 2 }));
    const mover = next.units.find((u) => u.id === 'r1')!,
      guard = next.units.find((u) => u.id === 'b1')!;
    expect(mover.position).toEqual({ x: 4, y: 2 });
    expect(mover.fuel).toBe(66);
    expect(mover.hp).toBeLessThan(100);
    expect(mover.ammo).toBe(6);
    expect(guard.hp).toBe(100);
    expect(guard.ammo).toBe(8);
    expect(guard.ambush).toBeUndefined();
    expect(next.tactics?.lastCombat?.ambush).toBe(true);
    expect(visibleEnemies(next, 'red').some((u) => u.id === guard.id)).toBe(true);
  });
  it('does not spend ammunition on preparation and expires the reservation at the next own turn', () => {
    const prepared = ok(prepareAmbush(state([unit('infantry', 'red', 0, 2), unit('infantry', 'blue', 8, 2)]), 'r1'));
    expect(prepared.units[0]!.ammo).toBe(9);
    const next = endTurn(endTurn(prepared));
    expect(next.units[0]!.ambush).toBeUndefined();
    expect(next.units[0]!.hasActed).toBe(false);
  });
  it('reconstructs a legal path around a visible ZOC and lets a move end inside it', () => {
    const s = state([unit('tank', 'red', 0, 2), unit('infantry', 'blue', 2, 1)]);
    expect(reachablePositionsForPlayer(s, 'r1', 'red')).toContainEqual({ x: 2, y: 2 });
    expect(ok(moveUnit(s, 'r1', { x: 3, y: 2 })).units[0]!.position).toEqual({ x: 3, y: 2 });
  });
  it('adds only restrained mountain cover for ground units', () => {
    const s = state([unit('infantry', 'red', 1, 2), unit('fighter', 'blue', 2, 2)]);
    s.board.terrain[2]![1] = { kind: 'mountain' };
    s.board.terrain[2]![2] = { kind: 'mountain' };
    expect(effectiveTerrainReduction(s, s.units[0]!)).toBe(45);
    expect(effectiveTerrainReduction(s, { ...s.units[0]!, hp: 50 })).toBe(22.5);
    expect(effectiveTerrainReduction(s, s.units[1]!)).toBe(40);
  });
});

describe('weather and submarine observation', () => {
  it('uses weather independent of the damage stream and the acting army', () => {
    const s = state([unit('fighter', 'red', 1, 2), unit('submarine', 'blue', 3, 2)]);
    for (let turn = 1; turn < 12; turn++) expect(weatherAt({ ...s, turn, activePlayer: 'blue', rngSeed: 42 })).toBe(weatherAt({ ...s, turn, activePlayer: 'red', rngSeed: 99 }));
  });
  it('hides a submerged unit on visible terrain and from movement previews until sonar detection', () => {
    const s = state([unit('fighter', 'red', 1, 2), { ...unit('submarine', 'blue', 3, 2), submerged: true, diveTurns: 0 }]);
    s.board = createBoard(9, 6, { kind: 'sea' });
    expect(visiblePositions(s, 'red')).toContainEqual({ x: 3, y: 2 });
    expect(visibleEnemies(s, 'red')).toEqual([]);
    const without = { ...s, units: [s.units[0]!] };
    expect(reachablePositionsForPlayer(s, 'r1', 'red')).toEqual(reachablePositionsForPlayer(without, 'r1', 'red'));
    const withSonar = { ...s, units: [unit('destroyer', 'red', 1, 2), s.units[1]!] };
    expect(visibleEnemies(withSonar, 'red')).toHaveLength(1);
    expect(forecastCombat(withSonar, withSonar.units[0]!, withSonar.units[1]!, 0).ok).toBe(false);
    expect(forecastCombat(withSonar, withSonar.units[0]!, withSonar.units[1]!, 1).ok).toBe(true);
  });
  it('spends the dive action and automatically surfaces after three own starts', () => {
    let s = state([unit('submarine', 'red', 1, 2), unit('submarine', 'blue', 7, 2)]);
    s.board = createBoard(9, 6, { kind: 'sea' });
    s = ok(toggleDive(s, 'r1'));
    expect(s.units[0]!.hasActed).toBe(true);
    for (let i = 0; i < 3; i++) s = endTurn(endTurn(s));
    expect(s.units[0]!.submerged).toBe(false);
  });
  it('rejects malformed tactical state and excludes enemy reservations from CPU decisions', () => {
    const s = state([unit('infantry', 'red', 0, 2), unit('infantry', 'blue', 8, 2)]);
    expect(validTacticalState({ ...s, tactics: null } as unknown as GameState)).toBe(false);
    expect(isGameState({ ...s, tactics: { ...s.tactics!, options: { weather: true } } })).toBe(false);
    const altered = { ...s, units: [s.units[0]!, { ...s.units[1]!, ambush: 0 as const, ammo: 1 }] };
    expect(chooseCpuAction(s)).toEqual(chooseCpuAction(altered));
  });
});

describe('moved transports and map snapshots', () => {
  for (const kind of ['apc', 'landingShip', 'transportHelicopter'] as const)
    it(`${kind} moves then unloads, finishing both actions; v12 stays unchanged`, () => {
      let s = state([unit(kind, 'red', 1, 2), { ...unit('infantry', 'red', 0, 0, 'cargo'), position: undefined, embarkedIn: 'r1' }, unit('infantry', 'blue', 8, 5)]);
      if (kind === 'landingShip') for (let x = 0; x < 9; x++) s.board.terrain[2]![x] = { kind: 'sea' };
      s = ok(moveUnit(s, 'r1', { x: 3, y: 2 }));
      const next = ok(disembarkUnit(s, 'r1', { x: 3, y: 1 }));
      expect(next.units.find((u) => u.id === 'cargo')!.position).toEqual({ x: 3, y: 1 });
      for (const id of ['r1', 'cargo']) expect(next.units.find((u) => u.id === id)).toMatchObject({ hasMoved: true, hasActed: true });
      expect(moveUnit(next, 'cargo', { x: 4, y: 1 }).ok).toBe(false);
      expect(disembarkUnit({ ...s, ruleVersion: 12, tactics: undefined }, 'r1', { x: 3, y: 1 }).ok).toBe(false);
    });
  it('creates a versioned tactical snapshot without mutating the released catalog', () => {
    for (const map of maps) {
      const before = JSON.stringify(scenarioDefinitionToData(map));
      const variant = tacticalScenario(map);
      expect(variant.tacticalOptions).toEqual(combinedTactics);
      expect(isGameState(createScenarioInitialState(variant))).toBe(true);
      expect(JSON.stringify(scenarioDefinitionToData(map))).toBe(before);
    }
  });
});
