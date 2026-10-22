import { describe, expect, it } from 'vitest';
import {
  applyGameCommand,
  bridgeBanks,
  bridgeDestinations,
  bridgeError,
  bridgeSites,
  buildBridge,
  createBoard,
  createGameState,
  createReplay,
  createScenarioInitialState,
  disembarkUnit,
  hasBridge,
  isGameCommand,
  isGameState,
  loadScenarioDefinitions,
  matchesScenarioInitialState,
  moveUnit,
  parseReplay,
  parseSavedGame,
  reachablePositionsForPlayer,
  saveGame,
  scenarioById,
  serializeReplay,
  unitMovementCost,
  validBridges,
  type GameState,
} from './index';
import { force, operationData, valueOf } from './operations.fixture';
import { ReplayTimeline } from './replayTimeline';
import { bluePlanningState } from '../ai/perspective';

function field(): GameState {
  const board = createBoard(9, 9);
  for (let y = 0; y < 9; y++) board.terrain[y]![4] = { kind: 'sea' };
  return {
    ...createGameState(board),
    ruleVersion: 9,
    units: [force('e', 'engineer', 3, 4), force('t', 'tank', 2, 4)],
    players: { red: { gold: 5000, income: 0 }, blue: { gold: 0, income: 0 } },
  };
}
const target = { x: 4, y: 4 };

describe('one-cell bridges', () => {
  it('pays once and makes a public, shared crossing while preserving sea and naval movement', () => {
    const initial = field(),
      next = valueOf(buildBridge(initial, 'e', target));
    expect(next.board).toBe(initial.board);
    expect(next.players.red.gold).toBe(4000);
    expect(next.units[0]).toMatchObject({ hasMoved: true, hasActed: true });
    expect(initial.bridges).toBeUndefined();
    expect(bridgeDestinations(initial, 'e')).toEqual([target]);
    expect(bridgeSites(initial.board)).toHaveLength(9);
    expect(hasBridge(next, target)).toBe(true);
    for (const kind of ['tank', 'engineer', 'destroyer', 'fighter'] as const) expect(unitMovementCost(next, target, kind)).toBe(1);
    expect(unitMovementCost(initial, target, 'tank')).toBe(Infinity);
    expect(unitMovementCost({ ...next, ruleVersion: 8 }, target, 'tank')).toBe(Infinity);
    expect(validBridges(next)).toBe(true);
    expect(isGameState(next)).toBe(true);
    const clear = { ...next, units: [force('t', 'tank', 3, 4)] };
    expect(valueOf(moveUnit(clear, 't', { x: 6, y: 4 })).units[0]!.position).toEqual({ x: 6, y: 4 });
    expect(valueOf(moveUnit({ ...clear, activePlayer: 'blue', units: [force('b', 'tank', 5, 4, { owner: 'blue' })] }, 'b', target)).units[0]!.position).toEqual(target);
    expect(valueOf(moveUnit({ ...clear, units: [force('s', 'destroyer', 4, 3)] }, 's', { x: 4, y: 5 })).units[0]!.position).toEqual({ x: 4, y: 5 });
    expect(moveUnit({ ...clear, units: [...clear.units, force('s', 'destroyer', 4, 4)] }, 't', target).ok).toBe(false);
  });
  it.each(['moved', 'acted', 'poor', 'limit', 'old', 'finished', 'kind', 'missing', 'enemy', 'cargo', 'occupied', 'built', 'far', 'wide', 'bank'] as const)(
    'rejects %s without mutation',
    (failure) => {
      const state = field();
      if (failure === 'moved') state.units[0]!.hasMoved = true;
      if (failure === 'acted') state.units[0]!.hasActed = true;
      if (failure === 'poor') state.players.red.gold = 999;
      if (failure === 'limit') state.bridges = [0, 1].map((y) => ({ owner: 'red', position: { x: 4, y } }));
      if (failure === 'old') state.ruleVersion = 8;
      if (failure === 'finished') state.winner = 'red';
      if (failure === 'kind') state.units[0]!.kind = 'infantry';
      if (failure === 'missing') state.units.shift();
      if (failure === 'enemy') state.activePlayer = 'blue';
      if (failure === 'cargo') {
        state.units[0]!.position = undefined;
        state.units[0]!.embarkedIn = 't';
      }
      if (failure === 'occupied') state.units.push(force('s', 'destroyer', 4, 4));
      if (failure === 'built') state.bridges = [{ owner: 'blue', position: target }];
      if (failure === 'far') state.units[0]!.position = { x: 0, y: 4 };
      if (failure === 'wide') state.board.terrain[4]![5] = { kind: 'sea' };
      if (failure === 'bank') state.board.terrain[4]![5] = { kind: 'mountain' };
      const copy = structuredClone(state);
      expect(bridgeError(state, 'e', target)).toBeTruthy();
      expect(buildBridge(state, 'e', target).ok).toBe(false);
      expect(bridgeDestinations(state, 'e')).toEqual([]);
      expect(state).toEqual(copy);
    },
  );
  it('supports vertical banks, rejects coordinates and prevents bridge chaining', () => {
    const board = createBoard(7, 5);
    for (let x = 0; x < 7; x++) board.terrain[2]![x] = { kind: 'sea' };
    expect(bridgeBanks(board, { x: 3, y: 2 })).toEqual([
      { x: 3, y: 1 },
      { x: 3, y: 3 },
    ]);
    for (const position of [
      { x: -1, y: 2 },
      { x: NaN, y: 2 },
      { x: 2.5, y: 2 },
      { x: 3, y: 0 },
    ])
      expect(bridgeBanks(board, position)).toEqual([]);
    board.terrain[3]![3] = { kind: 'sea' };
    expect(bridgeBanks(board, { x: 3, y: 2 })).toEqual([]);
  });
  it('allows unloading onto the bridge and blocks an occupied destination', () => {
    const state = valueOf(buildBridge(field(), 'e', target));
    state.units = [force('a', 'apc', 3, 4), { ...force('c', 'engineer', 0, 0), position: undefined, embarkedIn: 'a' }];
    expect(valueOf(disembarkUnit(state, 'a', target)).units.find((unit) => unit.id === 'c')!.position).toEqual(target);
    expect(disembarkUnit({ ...state, bridges: [] }, 'a', target).ok).toBe(false);
    expect(disembarkUnit({ ...state, units: [...state.units, force('b', 'tank', 4, 4, { owner: 'blue' })] }, 'a', target).ok).toBe(false);
  });
  it('keeps hidden contact rules on a public bridge', () => {
    const state = valueOf(buildBridge(field(), 'e', target));
    state.units = [force('t', 'tank', 0, 4), force('hidden', 'tank', 4, 4, { owner: 'blue' })];
    expect(reachablePositionsForPlayer(state, 't', 'red')).toContainEqual({ x: 5, y: 4 });
    expect(valueOf(moveUnit(state, 't', { x: 5, y: 4 })).units[0]!.position).toEqual({ x: 3, y: 4 });
  });
  it.each([
    null,
    42,
    {},
    [null],
    [{}],
    [{ owner: 'green', position: target }],
    [{ owner: 'red', position: { x: 4, y: 4, z: 1 } }],
    [{ owner: 'red', position: { x: 1, y: 1 } }],
    [{ owner: 'red', position: target, extra: 1 }],
    Array(5).fill({ owner: 'red', position: target }),
  ])('rejects malformed bridge state %#', (raw) => {
    expect(validBridges(Object.assign(field(), { bridges: raw }))).toBe(false);
  });
  it('rejects duplicates, per-side excess and old rules', () => {
    const state = valueOf(buildBridge(field(), 'e', target));
    expect(validBridges({ ...state, bridges: [...state.bridges!, ...state.bridges!] })).toBe(false);
    expect(validBridges({ ...state, bridges: [0, 1, 2].map((y) => ({ owner: 'red', position: { x: 4, y } })) })).toBe(false);
    expect(validBridges({ ...state, ruleVersion: 8 })).toBe(false);
    expect(validBridges(field())).toBe(true);
  });
  it('round trips saves, commands and replay seeks with public events and blue rotation', () => {
    const data = operationData({
      board: { width: 9, height: 9, cells: Array.from({ length: 9 }, (_, y) => [4, y, 'sea']) },
      startingGold: 5000,
      initialUnits: [
        { kind: 'engineer', owner: 'red', x: 3, y: 4 },
        { kind: 'infantry', owner: 'blue', x: 8, y: 8 },
      ],
      victoryConditions: [{ type: 'hold', positions: [{ x: 3, y: 4 }], turns: 1 }],
      defeatConditions: [{ type: 'eliminate' }],
    });
    const scenario = valueOf(loadScenarioDefinitions([data]))[0]!,
      initial = createScenarioInitialState(scenario);
    const command = { type: 'bridge' as const, unitId: 'r1', destination: target },
      next = valueOf(applyGameCommand(initial, command));
    expect(isGameCommand(command)).toBe(true);
    for (const invalid of [
      { ...command, extra: 1 },
      { ...command, destination: { x: 4, y: 4, z: 1 } },
      { ...command, destination: { x: Infinity, y: 4 } },
    ])
      expect(isGameCommand(invalid)).toBe(false);
    const saved = valueOf(
      saveGame({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, 'crossing', {
        mapId: scenario.id,
        difficulty: 'normal',
        initialState: initial,
        gameState: next,
        commands: [command],
      }),
    );
    expect(valueOf(parseSavedGame(JSON.stringify(saved))).gameState).toEqual(next);
    const replay = valueOf(
      parseReplay(valueOf(serializeReplay(valueOf(createReplay({ mapId: scenario.id, difficulty: 'normal', initialState: initial, commands: [command, { type: 'endTurn' }] }))))),
    );
    const timeline = new ReplayTimeline(replay);
    expect(valueOf(timeline.seek(1))).toEqual(next);
    expect(valueOf(timeline.seek(0))).toEqual(initial);
    expect(timeline.event(0, 'blue')).toBe('bridge');
    expect(bluePlanningState(next).bridges).toEqual([{ owner: 'red', position: target }]);
    const old = { ...createScenarioInitialState(scenarioById('skirmish')!), ruleVersion: 8 as const };
    expect(matchesScenarioInitialState(old, scenarioById('skirmish')!)).toBe(true);
  });
});
