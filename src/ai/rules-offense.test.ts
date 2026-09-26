import { describe, expect, it } from 'vitest';
import { createBoard, createGameState, CURRENT_RULE_VERSION, MODERN_RULE_VERSION, unitLimit, type DeployedUnit, type GameState, type Unit } from '../game';
import { chooseCpuAction, cpuDifficultyConfig, cpuForceLimit, evaluateCpuPosition, FACILITY_BLOCK_PENALTY, stalemateRelief } from './rules';

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
    const state: GameState = { ...createGameState(board), activePlayer: 'blue', units: [tank], players: { red: { gold: 0, income: 0 }, blue: { gold: 10_000, income: 0 } } };
    return { state, tank };
  };
  const score = (state: GameState, tank: DeployedUnit, x: number) =>
    evaluateCpuPosition(state, 'blue', tank, { x, y: 0 }, [{ x: 3, y: 0 }], cpuDifficultyConfig.hard, []);

  it('prefers stepping off an owned factory even though the factory gives better cover', () => {
    const { state, tank } = factoryState();
    expect(score(state, tank, 1)).toBeGreaterThan(score(state, tank, 0));
    const action = chooseCpuAction(state, 'hard');
    expect(action.type === 'move' && action.unitId === 't' && action.destination.x !== 0).toBe(true);
  });

  it('keeps the facility when it could not produce anyway or a visible enemy capturer is close', () => {
    const { state, tank } = factoryState();
    const stayPenalty = (setup: GameState, enemies: Unit[] = []) =>
      evaluateCpuPosition(setup, 'blue', tank, { x: 1, y: 0 }, [{ x: 3, y: 0 }], cpuDifficultyConfig.hard, enemies)
      - evaluateCpuPosition(setup, 'blue', tank, { x: 0, y: 0 }, [{ x: 3, y: 0 }], cpuDifficultyConfig.hard, enemies);
    const broke = { ...state, players: { ...state.players, blue: { gold: 0, income: 0 } } };
    expect(stayPenalty(state) - stayPenalty(broke)).toBe(FACILITY_BLOCK_PENALTY);
    // A capturer two tiles away: pressure is zero (out of range), only the block penalty differs.
    const raider = unit({ id: 'raider', kind: 'infantry', owner: 'red', position: { x: 2, y: 0 } });
    const threatened = { ...state, units: [...state.units, raider] };
    expect(stayPenalty(threatened, [raider]) - stayPenalty({ ...threatened, units: [tank, { ...raider, position: { x: 3, y: 0 } }] }, [{ ...raider, position: { x: 3, y: 0 } }])).toBeLessThan(0);
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
  it('finishes off a unit it can destroy even when another target scores a better trade', () => {
    const board = createBoard(3, 3);
    const state: GameState = {
      ...createGameState(board), activePlayer: 'blue',
      units: [
        unit({ id: 'b-inf', kind: 'infantry', owner: 'blue', position: { x: 1, y: 1 } }),
        // Recon: 50 damage dealt, 17 counter → trade score 33, not destroyed.
        unit({ id: 'healthy', kind: 'recon', owner: 'red', position: { x: 1, y: 0 } }),
        // Tank at 5 HP: 27 damage dealt, no counter → trade score 27, but destroyed.
        unit({ id: 'weak', kind: 'tank', owner: 'red', position: { x: 1, y: 2 }, hp: 5 }),
      ],
    };
    expect(chooseCpuAction(state, 'normal')).toEqual({ type: 'attack', unitId: 'b-inf', targetId: 'weak' });
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

describe('CPU force limit', () => {
  it('scales with open land and never drops below eight units', () => {
    expect(cpuForceLimit(createBoard(10, 8))).toBe(20);
    expect(cpuForceLimit(createBoard(2, 2))).toBe(8);
    expect(cpuForceLimit(createBoard(10, 8, { kind: 'sea' }))).toBe(8);
  });

  it('stops producing once the CPU force reaches the limit', () => {
    const board = createBoard(5, 2);
    board.terrain[0]![0] = { kind: 'factory', owner: 'blue', capturePoints: 20 };
    // Ten open tiles give the minimum limit of eight units.
    const troops = (count: number) => Array.from({ length: count }, (_, index) => unit({
      id: `b${index}`, kind: 'infantry', owner: 'blue', position: { x: (index + 1) % 5, y: Math.floor((index + 1) / 5) }, hasMoved: true, hasActed: true,
    }));
    const state = (units: Unit[]): GameState => ({
      ...createGameState(board), activePlayer: 'blue', units,
      players: { red: { gold: 0, income: 0 }, blue: { gold: 10_000, income: 0 } },
    });
    expect(cpuForceLimit(board)).toBe(8);
    expect(chooseCpuAction(state(troops(7)), 'normal').type).toBe('produce');
    expect(chooseCpuAction(state(troops(8)), 'normal').type).not.toBe('produce');
  });

  it('still answers a confirmed threat at the limit', () => {
    // 6x2 board: factory at (0,0), eight blue infantry, and a visible enemy bomber.
    const board = createBoard(6, 2);
    board.terrain[0]![0] = { kind: 'factory', owner: 'blue', capturePoints: 20 };
    const troops = Array.from({ length: 8 }, (_, index) => unit({
      id: `b${index}`, kind: 'infantry', owner: 'blue', position: { x: (index + 1) % 6, y: Math.floor((index + 1) / 6) }, hasMoved: true, hasActed: true,
    }));
    const bomber = unit({ id: 'enemy-bomber', kind: 'bomber', owner: 'red', position: { x: 5, y: 1 }, hasMoved: true, hasActed: true });
    const state: GameState = {
      ...createGameState(board), activePlayer: 'blue', units: [...troops, bomber],
      players: { red: { gold: 0, income: 0 }, blue: { gold: 10_000, income: 0 } },
    };
    expect(troops.length).toBe(cpuForceLimit(board));
    expect(chooseCpuAction(state, 'normal')).toEqual({ type: 'produce', factory: { x: 0, y: 0 }, kind: 'antiAir' });
  });
});

describe('CPU and the rule-version-3 unit limit', () => {
  it('orders no production at the rule limit, even the counters exempt from its own limit', () => {
    // 6x6 board: rule limit 10, CPU policy limit 9. A visible bomber would normally
    // trigger an exempt anti-air order.
    const board = createBoard(6, 6);
    board.terrain[0]![0] = { kind: 'factory', owner: 'blue', capturePoints: 20 };
    const force = (count: number) => Array.from({ length: count }, (_, index) => unit({
      id: `b${index}`, kind: 'infantry', owner: 'blue', position: { x: 1 + (index % 5), y: Math.floor(index / 5) }, hasMoved: true, hasActed: true,
    }));
    const bomber = unit({ id: 'enemy-bomber', kind: 'bomber', owner: 'red', position: { x: 1, y: 2 }, hasMoved: true, hasActed: true });
    const state = (count: number): GameState => ({
      ...createGameState(board), ruleVersion: CURRENT_RULE_VERSION, activePlayer: 'blue', units: [...force(count), bomber],
      players: { red: { gold: 0, income: 0 }, blue: { gold: 20_000, income: 0 } },
    });
    expect(unitLimit(board)).toBe(10);
    expect(chooseCpuAction(state(9), 'normal')).toEqual({ type: 'produce', factory: { x: 0, y: 0 }, kind: 'antiAir' });
    expect(chooseCpuAction(state(10), 'normal')).not.toMatchObject({ type: 'produce' });
  });
});

describe('CPU sieges', () => {
  it('attacks a garrison on a property it must capture at an even trade that outpaces its healing', () => {
    const board = createBoard(2, 1);
    const attack = (kind: 'capital' | 'forest') => {
      board.terrain[0]![1] = kind === 'capital' ? { kind: 'capital', owner: 'red', capturePoints: 20 } : { kind: 'forest' };
      const state: GameState = {
        ...createGameState(board), activePlayer: 'blue',
        units: [unit({ id: 'b', kind: 'infantry', owner: 'blue' }), unit({ id: 'r', kind: 'infantry', owner: 'red', position: { x: 1, y: 0 }, hasMoved: true, hasActed: true })],
      };
      return chooseCpuAction(state, 'easy');
    };
    // About 33 damage dealt (more than the 20 HP a capital heals) for about 33 taken.
    expect(attack('capital')).toEqual({ type: 'attack', unitId: 'b', targetId: 'r' });
    // The same exchange in a forest is not a capture objective, so the cautious easy CPU holds.
    expect(attack('forest')).not.toEqual({ type: 'attack', unitId: 'b', targetId: 'r' });
  });

  it('declines a 1:2 trade against a heavy garrison even with a capturer beside it (review regression)', () => {
    // Tank into a heavy tank on a capital: about 32 dealt for about 64 taken.
    const board = createBoard(3, 1);
    board.terrain[0]![1] = { kind: 'capital', owner: 'red', capturePoints: 20 };
    const state: GameState = {
      ...createGameState(board), ruleVersion: MODERN_RULE_VERSION, activePlayer: 'blue', turn: 60,
      units: [
        unit({ id: 'b', kind: 'tank', owner: 'blue' }),
        unit({ id: 'capturer', kind: 'infantry', owner: 'blue', position: { x: 2, y: 0 }, hasMoved: true, hasActed: true }),
        unit({ id: 'r', kind: 'heavyTank', owner: 'red', position: { x: 1, y: 0 }, hasMoved: true, hasActed: true }),
      ],
    };
    expect(chooseCpuAction(state, 'hard')).not.toEqual({ type: 'attack', unitId: 'b', targetId: 'r' });
  });

  it('does not feed units into a garrison it cannot out-damage (review regression)', () => {
    // Infantry against a tank on a capital: 17 damage dealt, 56 taken, and the
    // capital heals 20 per turn. Even hard in a long match must not attack.
    const board = createBoard(2, 1);
    board.terrain[0]![1] = { kind: 'capital', owner: 'red', capturePoints: 20 };
    const state: GameState = {
      ...createGameState(board), activePlayer: 'blue', turn: 60,
      units: [unit({ id: 'b', kind: 'infantry', owner: 'blue' }), unit({ id: 'r', kind: 'tank', owner: 'red', position: { x: 1, y: 0 }, hasMoved: true, hasActed: true })],
    };
    expect(chooseCpuAction(state, 'hard')).not.toEqual({ type: 'attack', unitId: 'b', targetId: 'r' });
  });
});
