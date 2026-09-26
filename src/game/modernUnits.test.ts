import { describe, expect, it } from 'vitest';
import { chooseCpuAction } from '../ai/rules';
import {
  attackUnit, captureProperty, createBoard, createGameState, embarkUnit, endTurn, forecastCombat, idleProductionFacilities, isGameState,
  isUnitKindAvailable, MODERN_RULE_VERSION, moveUnit, produceUnit, productionKindsForRule, reachablePositions, unitStats,
  type Board, type GameState, type Unit,
} from './index';

const unit = (patch: Partial<Unit> & Pick<Unit, 'id' | 'kind' | 'owner'>): Unit => ({
  position: { x: 0, y: 0 }, hp: 100, hasMoved: false, hasActed: false, ...patch,
});

function withRules(board: Board, units: Unit[], modern: boolean, gold = 50_000): GameState {
  return {
    ...createGameState(board), ...(modern ? { ruleVersion: MODERN_RULE_VERSION } : {}), units,
    players: { red: { gold, income: 0 }, blue: { gold, income: 0 } },
  };
}

const modernKinds = ['mech', 'heavyTank', 'helicopter', 'battleship'] as const;

describe('modern-only unit availability', () => {
  it('keeps the classic roster for states without a rule version', () => {
    for (const kind of modernKinds) {
      expect(isUnitKindAvailable(kind, undefined)).toBe(false);
      expect(isUnitKindAvailable(kind, MODERN_RULE_VERSION)).toBe(true);
    }
    const classic = productionKindsForRule('facility-v2');
    const modern = productionKindsForRule('facility-v2', MODERN_RULE_VERSION);
    expect(classic.factory).not.toContain('mech');
    expect(modern.factory).toEqual(expect.arrayContaining(['mech', 'heavyTank']));
    expect(modern.airport).toContain('helicopter');
    expect(modern.port).toContain('battleship');
    expect(modern.factory).not.toContain('helicopter');
  });

  it('rejects producing a modern unit in a classic match and accepts it in a modern match', () => {
    const board = createBoard(1, 1, { kind: 'factory', owner: 'red', capturePoints: 20 });
    expect(produceUnit(withRules(board, [], false), { x: 0, y: 0 }, 'mech'))
      .toEqual({ ok: false, error: 'An owned compatible production facility is required' });
    const produced = produceUnit(withRules(board, [], true), { x: 0, y: 0 }, 'mech');
    expect(produced.ok && produced.value.units[0]).toMatchObject({ kind: 'mech', fuel: unitStats.mech.fuel });
    expect(produced.ok && produced.value.players.red.gold).toBe(50_000 - unitStats.mech.cost);
  });

  it('lists modern units at idle facilities only in modern matches', () => {
    const board = createBoard(1, 1, { kind: 'port', owner: 'red', capturePoints: 20 });
    expect(idleProductionFacilities(withRules(board, [], false), 'red')[0]?.kinds).not.toContain('battleship');
    expect(idleProductionFacilities(withRules(board, [], true), 'red')[0]?.kinds).toContain('battleship');
  });
});

describe('new unit behaviour', () => {
  it('lets mech infantry capture and ride an APC', () => {
    const board = createBoard(2, 1);
    board.terrain[0]![0] = { kind: 'city', capturePoints: 20 };
    const state = withRules(board, [
      unit({ id: 'm', kind: 'mech', owner: 'red' }),
      unit({ id: 'apc', kind: 'apc', owner: 'red', position: { x: 1, y: 0 } }),
    ], true);
    const captured = captureProperty(state, 'm');
    expect(captured.ok && captured.value.board.terrain[0]![0]!.capturePoints).toBe(10);
    expect(embarkUnit(state, 'm', 'apc').ok).toBe(true);
  });

  it('makes mech infantry the stronger anti-armour foot soldier', () => {
    const board = createBoard(2, 1);
    const damageTo = (kind: 'infantry' | 'mech') => {
      const state = withRules(board, [unit({ id: 'a', kind, owner: 'red' }), unit({ id: 't', kind: 'tank', owner: 'blue', position: { x: 1, y: 0 } })], true);
      const result = forecastCombat(state, state.units[0]!, state.units[1]!);
      return result.ok ? result.value.damageToDefender : 0;
    };
    expect(damageTo('mech')).toBeGreaterThan(damageTo('infantry'));
  });

  it('gives heavy tanks and battleships armour against incoming damage', () => {
    const board = createBoard(2, 1);
    const damageTo = (kind: 'tank' | 'heavyTank') => {
      const state = withRules(board, [unit({ id: 'a', kind: 'tank', owner: 'red' }), unit({ id: 'd', kind, owner: 'blue', position: { x: 1, y: 0 } })], true);
      const result = forecastCombat(state, state.units[0]!, state.units[1]!);
      return result.ok ? result.value.damageToDefender : 0;
    };
    expect(damageTo('heavyTank')).toBeLessThan(damageTo('tank'));
    expect(damageTo('heavyTank')).toBeGreaterThan(0);
  });

  it('fires battleships indirectly at range 2-6 without counterattacks, and not after moving', () => {
    const board = createBoard(8, 1, { kind: 'sea' });
    board.terrain[0]![6] = { kind: 'plain' };
    board.terrain[0]![7] = { kind: 'plain' };
    board.terrain[0]![1] = { kind: 'plain' };
    const state = withRules(board, [
      unit({ id: 'b', kind: 'battleship', owner: 'red' }),
      unit({ id: 't', kind: 'tank', owner: 'blue', position: { x: 6, y: 0 } }),
      unit({ id: 'near', kind: 'infantry', owner: 'blue', position: { x: 1, y: 0 } }),
      // The target lies beyond the battleship's own vision, so a spotter reveals it.
      unit({ id: 'spotter', kind: 'recon', owner: 'red', position: { x: 7, y: 0 }, hasMoved: true, hasActed: true }),
    ], true);
    const forecast = forecastCombat(state, state.units[0]!, state.units[1]!);
    expect(forecast).toMatchObject({ ok: true, value: { canCounter: false, damageToAttacker: 0 } });
    expect(forecastCombat(state, state.units[0]!, state.units[2]!)).toEqual({ ok: false, error: 'Target is out of range' });
    const fired = attackUnit(state, 'b', 't');
    expect(fired.ok && fired.value.units.find(candidate => candidate.id === 'b')?.hp).toBe(100);

    const moved = moveUnit(state, 'b', { x: 0, y: 0 });
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(attackUnit(moved.value, 'b', 't')).toEqual({ ok: false, error: 'Indirect units cannot attack after moving' });
  });
});

describe('new unit movement and upkeep', () => {
  it('limits mech infantry to 2 movement and heavy tanks to 4, with vehicle terrain costs', () => {
    const board = createBoard(7, 1);
    board.terrain[0]![1] = { kind: 'forest' };
    const state = withRules(board, [
      unit({ id: 'm', kind: 'mech', owner: 'red' }),
      unit({ id: 'h', kind: 'heavyTank', owner: 'red', position: { x: 2, y: 0 } }),
    ], true);
    expect(reachablePositions(state, 'm').map(position => position.x).sort()).toEqual([1]);
    // 4 movement reaches x=6 to the east; the forest at x=1 costs a vehicle 2 and the mech blocks x=0.
    expect(reachablePositions(state, 'h').map(position => position.x).sort()).toEqual([1, 3, 4, 5, 6]);
    // A 5th plain tile would be out of range for the heavy tank's 4 movement.
    expect(reachablePositions({ ...state, board: createBoard(8, 1), units: [state.units[1]!] }, 'h').map(position => position.x).sort())
      .toEqual([0, 1, 3, 4, 5, 6]);
  });

  it('burns 2 fuel per turn on a helicopter and services it only at an airport', () => {
    const board = createBoard(3, 1);
    board.terrain[0]![0] = { kind: 'city', owner: 'red', capturePoints: 20 };
    board.terrain[0]![2] = { kind: 'airport', owner: 'red', capturePoints: 20 };
    const next = endTurn({
      ...withRules(board, [
        unit({ id: 'city-heli', kind: 'helicopter', owner: 'red', hp: 50, fuel: 40 }),
        unit({ id: 'airport-heli', kind: 'helicopter', owner: 'red', hp: 50, fuel: 40, position: { x: 2, y: 0 } }),
      ], true),
      activePlayer: 'blue',
    });
    expect(next.units.find(candidate => candidate.id === 'city-heli')).toMatchObject({ hp: 50, fuel: 38 });
    expect(next.units.find(candidate => candidate.id === 'airport-heli')).toMatchObject({ hp: 70, fuel: unitStats.helicopter.fuel });
  });

  it('makes anti-air vehicles the counter to helicopters', () => {
    const board = createBoard(2, 1);
    const damage = (attacker: 'antiAir' | 'tank') => {
      const state = withRules(board, [unit({ id: 'a', kind: attacker, owner: 'red' }), unit({ id: 'h', kind: 'helicopter', owner: 'blue', position: { x: 1, y: 0 } })], true);
      const result = forecastCombat(state, state.units[0]!, state.units[1]!);
      return result.ok ? result.value.damageToDefender : 0;
    };
    expect(damage('antiAir')).toBeGreaterThanOrEqual(100);
    expect(damage('antiAir')).toBeGreaterThan(damage('tank') * 3);
  });

  it('rejects classic states that contain modern-only units', () => {
    const board = createBoard(2, 1);
    expect(isGameState(withRules(board, [unit({ id: 'm', kind: 'mech', owner: 'red' })], true))).toBe(true);
    expect(isGameState(withRules(board, [unit({ id: 'm', kind: 'mech', owner: 'red' })], false))).toBe(false);
  });
});

describe('CPU production of new units', () => {
  const factoryBoard = () => {
    const board = createBoard(6, 1);
    board.terrain[0]![0] = { kind: 'factory', owner: 'blue', capturePoints: 20 };
    return board;
  };
  const cpuState = (modern: boolean): GameState => ({
    ...withRules(factoryBoard(), [
      unit({ id: 'enemy-tank', kind: 'tank', owner: 'red', position: { x: 2, y: 0 } }),
      unit({ id: 'scout', kind: 'recon', owner: 'blue', position: { x: 1, y: 0 }, hasMoved: true, hasActed: true }),
    ], modern, 5000),
    activePlayer: 'blue',
  });

  it('answers visible armour with mech infantry under modern rules', () => {
    expect(chooseCpuAction(cpuState(true), 'normal')).toEqual({ type: 'produce', factory: { x: 0, y: 0 }, kind: 'mech' });
  });

  it('never picks a modern unit in a classic match', () => {
    const action = chooseCpuAction(cpuState(false), 'normal');
    expect(action.type === 'produce' && modernKinds.includes(action.kind as typeof modernKinds[number])).toBe(false);
  });
});
