import { describe, expect, it } from 'vitest';
import { createBoard, createGameState, MODERN_RULE_VERSION, type DeployedUnit, type GameState, type Unit } from '../game';
import { chooseCpuAction, cpuDifficultyConfig, evaluateCpuPosition, FACILITY_BLOCK_PENALTY, stalemateRelief } from './rules';

const unit = (patch: Partial<Unit> & Pick<Unit, 'id' | 'kind' | 'owner'>): Unit => ({
  position: { x: 0, y: 0 }, hp: 100, hasMoved: false, hasActed: false, ...patch,
});

describe('CPU does not park on its own production facilities (#116 10.2)', () => {
  const factoryState = (patch: Partial<Unit> = {}): { state: GameState; tank: DeployedUnit } => {
    const board = createBoard(4, 1);
    board.terrain[0]![0] = { kind: 'factory', owner: 'blue', capturePoints: 20 };
    // A neutral city gives the CPU an objective to advance toward.
    board.terrain[0]![3] = { kind: 'city', capturePoints: 20 };
    const tank = unit({ id: 't', kind: 'tank', owner: 'blue', ...patch }) as DeployedUnit;
    return { state: { ...createGameState(board), activePlayer: 'blue', units: [tank] }, tank };
  };
  const score = (state: GameState, tank: DeployedUnit, x: number) =>
    evaluateCpuPosition(state, 'blue', tank, { x, y: 0 }, [{ x: 3, y: 0 }], cpuDifficultyConfig.hard, []);

  it('prefers stepping off an owned factory even though the factory gives better cover', () => {
    const { state, tank } = factoryState();
    expect(score(state, tank, 1)).toBeGreaterThan(score(state, tank, 0));
    expect(chooseCpuAction(state, 'hard')).toEqual({ type: 'move', unitId: 't', destination: expect.objectContaining({ y: 0 }) });
  });

  it('lets a badly damaged unit stay on the facility to be serviced', () => {
    const healthy = factoryState();
    const damaged = factoryState({ hp: 40 });
    const stayPenalty = (setup: typeof healthy) => score(setup.state, setup.tank, 1) - score(setup.state, setup.tank, 0);
    expect(stayPenalty(healthy) - stayPenalty(damaged)).toBeGreaterThanOrEqual(FACILITY_BLOCK_PENALTY - 20);
  });

  it('does not penalize standing on a city, which cannot produce', () => {
    const board = createBoard(2, 1);
    board.terrain[0]![0] = { kind: 'city', owner: 'blue', capturePoints: 20 };
    const tank = unit({ id: 't', kind: 'tank', owner: 'blue' }) as DeployedUnit;
    const state = { ...createGameState(board), activePlayer: 'blue' as const, units: [tank] };
    const onCity = evaluateCpuPosition(state, 'blue', tank, { x: 0, y: 0 }, [], cpuDifficultyConfig.hard, []);
    const onPlain = evaluateCpuPosition(state, 'blue', tank, { x: 1, y: 0 }, [], cpuDifficultyConfig.hard, []);
    expect(onCity).toBeGreaterThan(onPlain);
  });
});

describe('CPU focus fire', () => {
  it('finishes off a unit it can destroy before trading blows with a healthier one', () => {
    const board = createBoard(3, 3);
    const state: GameState = {
      ...createGameState(board), activePlayer: 'blue',
      units: [
        unit({ id: 'b-tank', kind: 'tank', owner: 'blue', position: { x: 1, y: 1 } }),
        // The healthy artillery offers the larger damage-minus-counter score (no counter at range 1? it has range 2-3, so none).
        unit({ id: 'healthy', kind: 'artillery', owner: 'red', position: { x: 1, y: 0 } }),
        unit({ id: 'weak', kind: 'infantry', owner: 'red', position: { x: 1, y: 2 }, hp: 10 }),
      ],
    };
    expect(chooseCpuAction(state, 'normal')).toEqual({ type: 'attack', unitId: 'b-tank', targetId: 'weak' });
  });
});

describe('CPU stalemate relief', () => {
  it('is zero early and grows to a cap only from the public round number', () => {
    expect(stalemateRelief({ turn: 1 })).toBe(0);
    expect(stalemateRelief({ turn: 20 })).toBe(0);
    expect(stalemateRelief({ turn: 30 })).toBeCloseTo(0.4);
    expect(stalemateRelief({ turn: 200 })).toBe(0.6);
  });

  it('weighs visible counterattack risk less in a long match', () => {
    const board = createBoard(4, 1);
    const tank = unit({ id: 't', kind: 'tank', owner: 'blue' }) as DeployedUnit;
    const enemy = unit({ id: 'e', kind: 'tank', owner: 'red', position: { x: 3, y: 0 } });
    const base = { ...createGameState(board), activePlayer: 'blue' as const, units: [tank, enemy] };
    const risk = (turn: number) => {
      const state = { ...base, turn };
      return evaluateCpuPosition(state, 'blue', tank, { x: 0, y: 0 }, [], cpuDifficultyConfig.normal, [])
        - evaluateCpuPosition(state, 'blue', tank, { x: 2, y: 0 }, [], cpuDifficultyConfig.normal, [enemy]);
    };
    expect(risk(50)).toBeLessThan(risk(1));
  });
});

describe('CPU supply vehicles (modern rules)', () => {
  it('moves an APC next to allied ground units that need resupply', () => {
    const board = createBoard(5, 1);
    const apc = unit({ id: 'apc', kind: 'apc', owner: 'blue', position: { x: 0, y: 0 } }) as DeployedUnit;
    const thirsty = unit({ id: 'tank', kind: 'tank', owner: 'blue', position: { x: 3, y: 0 }, ammo: 0, hasMoved: true, hasActed: true });
    const modern: GameState = { ...createGameState(board), ruleVersion: MODERN_RULE_VERSION, activePlayer: 'blue', units: [apc, thirsty] };
    const score = (state: GameState, x: number) => evaluateCpuPosition(state, 'blue', apc, { x, y: 0 }, [], cpuDifficultyConfig.normal, []);
    expect(score(modern, 2) - score(modern, 1)).toBe(30);
    const classic = { ...modern, ruleVersion: undefined };
    expect(score(classic, 2) - score(classic, 1)).toBe(0);
  });
});

describe('CPU resupply need', () => {
  it('treats an armed unit with an empty magazine as needing resupply, but not unarmed transports', () => {
    const board = createBoard(2, 1);
    board.terrain[0]![0] = { kind: 'city', owner: 'blue', capturePoints: 20 };
    const score = (subject: DeployedUnit, x: number) => {
      const state: GameState = { ...createGameState(board), activePlayer: 'blue', units: [subject] };
      return evaluateCpuPosition(state, 'blue', subject, { x, y: 0 }, [], cpuDifficultyConfig.normal, []);
    };
    const emptyTank = unit({ id: 't', kind: 'tank', owner: 'blue', position: { x: 1, y: 0 }, ammo: 0 }) as DeployedUnit;
    const fullTank = unit({ id: 't', kind: 'tank', owner: 'blue', position: { x: 1, y: 0 } }) as DeployedUnit;
    // The +80 resupply incentive applies only to the empty tank.
    expect((score(emptyTank, 0) - score(emptyTank, 1)) - (score(fullTank, 0) - score(fullTank, 1))).toBe(80);
  });
});
