import { describe, expect, it } from 'vitest';
import { chooseCpuAction, cpuDifficultyConfig, evaluateCpuPosition } from './rules';
import {
  applyGameCommand,
  createBoard,
  createGameState,
  createScenarioInitialState,
  endTurn,
  loadScenarioDefinitions,
  unitStats,
  type DeployedUnit,
  type GameState,
  type UnitKind,
  type VictoryCondition,
} from '../game';

function unit(id: string, kind: UnitKind, x: number, y: number, patch: Partial<DeployedUnit> = {}): DeployedUnit {
  return { id, kind, owner: 'red', position: { x, y }, hp: 100, fuel: unitStats[kind].fuel, ammo: unitStats[kind].ammo, hasMoved: false, hasActed: false, ...patch };
}
function objectiveBattle(condition: VictoryCondition, units: DeployedUnit[], cells: readonly (readonly [number, number, string, string?])[] = []): GameState {
  const loaded = loadScenarioDefinitions([
    {
      id: 'campaign-ai',
      name: 'Campaign AI',
      briefing: 'Test orders',
      startingGold: 0,
      board: { width: 8, height: 3, cells },
      initialUnits: [],
      victoryConditions: [condition],
      defeatConditions: [{ type: 'eliminate' }],
    },
  ]);
  if (!loaded.ok) throw new Error(loaded.error);
  return { ...createScenarioInitialState(loaded.value[0]!), units, players: { red: { gold: 0, income: 0 }, blue: { gold: 0, income: 0 } } };
}
function apply(state: GameState, command: ReturnType<typeof chooseCpuAction>) {
  const next = applyGameCommand(state, command);
  if (!next.ok) throw new Error(next.error);
  return next.value;
}

describe('campaign CPU progression regressions', () => {
  it('moves a damaged non-capturer off an enemy objective before sending infantry to capture', () => {
    let state = objectiveBattle(
      { type: 'hold', positions: [{ x: 2, y: 1 }], turns: 3, requireOwnership: true, groundOnly: true },
      [unit('r1', 'tank', 2, 1, { hp: 30, ammo: 0 }), unit('r2', 'infantry', 1, 1)],
      [[2, 1, 'factory', 'blue']],
    );
    const leave = chooseCpuAction(state, 'hard');
    expect(leave).toMatchObject({ type: 'move', unitId: 'r1' });
    state = apply(state, leave);
    const enter = chooseCpuAction(state, 'hard');
    expect(enter).toEqual({ type: 'move', unitId: 'r2', destination: { x: 2, y: 1 } });
    state = apply(state, enter);
    expect(chooseCpuAction(state, 'hard')).toEqual({ type: 'capture', unitId: 'r2' });
  });

  it('rotates a critically wounded capturer when a healthy replacement can finish sooner', () => {
    const state = objectiveBattle({ type: 'captureCapital' }, [unit('r1', 'infantry', 7, 1, { hp: 5 }), unit('r2', 'infantry', 6, 1)], [[7, 1, 'capital', 'blue']]);
    expect(chooseCpuAction(state, 'hard')).toMatchObject({ type: 'move', unitId: 'r1' });
    const alone = { ...state, units: [state.units[0]!] };
    expect(chooseCpuAction(alone, 'hard')).toEqual({ type: 'capture', unitId: 'r1' });
  });

  it('routes an empty magazine toward compatible service rather than back toward the front', () => {
    const tank = unit('r', 'tank', 4, 1, { ammo: 0 });
    const state = objectiveBattle({ type: 'hold', positions: [{ x: 7, y: 1 }], turns: 3 }, [tank], [[0, 1, 'city', 'red']]);
    expect(chooseCpuAction(state, 'normal')).toEqual({ type: 'move', unitId: 'r', destination: { x: 0, y: 1 } });
  });

  it('values an indirect firing position above driving inside minimum range', () => {
    const gun = unit('r', 'artillery', 1, 1);
    const enemy = unit('b', 'tank', 6, 1, { owner: 'blue' });
    const state = objectiveBattle({ type: 'captureCapital' }, [gun, enemy], [[7, 1, 'capital', 'blue']]);
    const score = (x: number) => evaluateCpuPosition(state, 'red', gun, { x, y: 1 }, [{ x: 7, y: 1 }], cpuDifficultyConfig.hard, [enemy]);
    expect(score(3)).toBeGreaterThan(score(5));
  });

  it('assigns advancing troops to the remaining hold point while a guard stays at the secured point', () => {
    const state = objectiveBattle(
      {
        type: 'hold',
        positions: [
          { x: 1, y: 1 },
          { x: 7, y: 1 },
        ],
        turns: 3,
        groundOnly: true,
      },
      [unit('r1', 'tank', 1, 1), unit('r2', 'infantry', 2, 1)],
    );
    expect(chooseCpuAction(state, 'hard')).toEqual({ type: 'wait', unitId: 'r1' });
    const next = apply(state, chooseCpuAction(state, 'hard'));
    expect(chooseCpuAction(next, 'hard')).toEqual({ type: 'move', unitId: 'r2', destination: { x: 5, y: 1 } });
  });

  it('lands from offshore without parking the transport on the port needed by its infantry', () => {
    const board = createBoard(8, 3, { kind: 'sea' });
    board.terrain[1]![0] = { kind: 'plain' };
    board.terrain[1]![7] = { kind: 'port', owner: 'blue', capturePoints: 20 };
    let state: GameState = {
      ...createGameState(board),
      players: { red: { gold: 0, income: 0 }, blue: { gold: 0, income: 0 } },
      units: [unit('ship', 'landingShip', 2, 1), { ...unit('cargo', 'infantry', 0, 1), position: undefined, embarkedIn: 'ship' }],
    };
    const sail = chooseCpuAction(state, 'hard');
    expect(sail).toEqual({ type: 'move', unitId: 'ship', destination: { x: 6, y: 1 } });
    state = endTurn(endTurn(apply(state, sail)));
    const land = chooseCpuAction(state, 'hard');
    expect(land).toEqual({ type: 'disembark', transportId: 'ship', destination: { x: 7, y: 1 } });
    state = endTurn(endTurn(apply(state, land)));
    expect(chooseCpuAction(state, 'hard')).toEqual({ type: 'capture', unitId: 'cargo' });
  });

  it('never issues a second move to infantry that already moved toward a rendezvous', () => {
    const board = createBoard(8, 3, { kind: 'sea' });
    for (let x = 0; x < 3; x++) board.terrain[1]![x] = { kind: 'plain' };
    board.terrain[1]![7] = { kind: 'capital', owner: 'blue' };
    const state = {
      ...createGameState(board),
      units: [unit('foot', 'infantry', 0, 1, { hasMoved: true }), unit('ship', 'landingShip', 3, 1)],
      players: { red: { gold: 0, income: 0 }, blue: { gold: 0, income: 0 } },
    };
    const action = chooseCpuAction(state, 'hard');
    expect(action).not.toMatchObject({ type: 'move', unitId: 'foot' });
    expect(applyGameCommand(state, action).ok).toBe(true);
  });
});
