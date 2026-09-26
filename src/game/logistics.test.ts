import { describe, expect, it } from 'vitest';
import { cpuDifficultyConfig, evaluateCpuPosition } from '../ai/rules';
import {
  affordableRepair, canServiceUnitAt, createBoard, createGameState, createReplay, createScenarioInitialState, endTurn,
  CURRENT_RULE_VERSION, isGameState, matchesScenarioInitialState, MODERN_RULE_VERSION, parseReplay, parseSavedGame, replayCommands, saveCustomScenario,
  saveGame, serializeReplay, summarizeRepairs, summarizeReplay, unitStats, type Board, type DeployedUnit, type GameCommand, type GameState,
  type ScenarioData, type Unit,
} from './index';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

const unit = (patch: Partial<Unit> & Pick<Unit, 'id' | 'kind'>): Unit => ({
  owner: 'red', position: { x: 0, y: 0 }, hp: 100, hasMoved: true, hasActed: true, ...patch,
});

/** A modern-rule state on blue's turn, so one `endTurn` runs red's turn-start upkeep. */
function modernBeforeRedTurn(board: Board, units: Unit[], redGold = 0): GameState {
  return {
    ...createGameState(board), ruleVersion: MODERN_RULE_VERSION, activePlayer: 'blue', units,
    players: { red: { gold: redGold, income: 0 }, blue: { gold: 0, income: 0 } },
  };
}

describe('modern facility compatibility', () => {
  it('services ground units at cities, factories, and capitals, aircraft at airports, and ships at ports', () => {
    for (const terrain of ['city', 'factory', 'capital'] as const) {
      expect(canServiceUnitAt(terrain, 'tank')).toBe(true);
      expect(canServiceUnitAt(terrain, 'fighter')).toBe(false);
    }
    expect(canServiceUnitAt('airport', 'fighter')).toBe(true);
    expect(canServiceUnitAt('airport', 'infantry')).toBe(false);
    expect(canServiceUnitAt('port', 'destroyer')).toBe(true);
    expect(canServiceUnitAt('port', 'tank')).toBe(false);
  });
});

describe('modern paid repairs', () => {
  it('collects income before charging 1% of the unit price per repaired HP', () => {
    const board = createBoard(2, 1);
    board.terrain[0]![0] = { kind: 'city', owner: 'red', capturePoints: 20 };
    const next = endTurn(modernBeforeRedTurn(board, [unit({ id: 't', kind: 'tank', hp: 50, fuel: 10, ammo: 1 })], 5000));
    const repairCost = unitStats.tank.cost * 0.2;
    expect(next.units[0]).toMatchObject({ hp: 70, fuel: unitStats.tank.fuel, ammo: unitStats.tank.ammo });
    expect(next.players.red.gold).toBe(5000 + 1000 - repairCost);
  });

  it('rounds repairs down to 10 HP steps when funds run short, and still resupplies when nothing is affordable', () => {
    const board = createBoard(2, 1);
    board.terrain[0]![0] = { kind: 'city', owner: 'red', capturePoints: 20 };
    // Income 1000 covers 10 HP of a 7000G tank (700G) but not 20 HP (1400G).
    const partial = endTurn(modernBeforeRedTurn(board, [unit({ id: 't', kind: 'tank', hp: 50 })]));
    expect(partial.units[0]!.hp).toBe(60);
    expect(partial.players.red.gold).toBe(300);

    const broke = endTurn(modernBeforeRedTurn(board, [unit({ id: 'r', kind: 'rocket', hp: 50, ammo: 0 })]));
    expect(broke.units[0]).toMatchObject({ hp: 50, ammo: unitStats.rocket.ammo });
    expect(broke.players.red.gold).toBe(1000);
  });

  it('repairs only the missing HP when a unit needs less than 20', () => {
    expect(affordableRepair('tank', 15, 10_000)).toBe(15);
    expect(affordableRepair('tank', 15, 800)).toBe(10);
    expect(affordableRepair('tank', 15, 699)).toBe(0);
    expect(affordableRepair('tank', 0, 10_000)).toBe(0);
  });

  it('spends limited funds in unit order', () => {
    const board = createBoard(2, 1, { kind: 'city', owner: 'red', capturePoints: 20 });
    // Income is 2000 (two cities). Repairing the first tank fully costs 1400.
    const next = endTurn(modernBeforeRedTurn(board, [
      unit({ id: 'first', kind: 'tank', hp: 50, position: { x: 0, y: 0 } }),
      unit({ id: 'second', kind: 'tank', hp: 50, position: { x: 1, y: 0 } }),
    ]));
    expect(next.units.map(candidate => candidate.hp)).toEqual([70, 50]);
    expect(next.players.red.gold).toBe(600);
  });

  it('does not service aircraft on a city: they keep burning fuel and are lost when empty', () => {
    const board = createBoard(2, 1);
    board.terrain[0]![0] = { kind: 'city', owner: 'red', capturePoints: 20 };
    board.terrain[0]![1] = { kind: 'airport', owner: 'red', capturePoints: 20 };
    const next = endTurn(modernBeforeRedTurn(board, [
      unit({ id: 'city-fighter', kind: 'fighter', hp: 50, fuel: 30 }),
      unit({ id: 'airport-fighter', kind: 'fighter', hp: 50, fuel: 30, position: { x: 1, y: 0 } }),
    ], 10_000));
    expect(next.units.find(candidate => candidate.id === 'city-fighter')).toMatchObject({ hp: 50, fuel: 25 });
    expect(next.units.find(candidate => candidate.id === 'airport-fighter')).toMatchObject({ hp: 70, fuel: unitStats.fighter.fuel });

    const empty = endTurn(modernBeforeRedTurn(board, [unit({ id: 'dry', kind: 'fighter', fuel: 5 })]));
    expect(empty.units).toEqual([]);
  });

  it('keeps classic rules unchanged when the state has no rule version', () => {
    const board = createBoard(1, 1, { kind: 'city', owner: 'red', capturePoints: 20 });
    const classic = { ...modernBeforeRedTurn(board, [unit({ id: 'f', kind: 'fighter', hp: 50, fuel: 30 })]), ruleVersion: undefined };
    const next = endTurn(classic);
    expect(next.units[0]).toMatchObject({ hp: 70, fuel: unitStats.fighter.fuel });
    expect(next.players.red.gold).toBe(1000);
    expect(summarizeRepairs(classic, next, 'red')).toEqual({ units: 1, hp: 20, cost: 0 });
  });
});

describe('modern supply vehicles', () => {
  it('refuels and rearms adjacent ground units and its cargo, but not aircraft or distant units', () => {
    const board = createBoard(4, 2);
    const next = endTurn(modernBeforeRedTurn(board, [
      unit({ id: 'apc', kind: 'apc', position: { x: 1, y: 0 }, fuel: 20, ammo: 2 }),
      unit({ id: 'tank', kind: 'tank', position: { x: 2, y: 0 }, fuel: 3, ammo: 0 }),
      unit({ id: 'cargo', kind: 'infantry', position: undefined, embarkedIn: 'apc', ammo: 0 }),
      unit({ id: 'fighter', kind: 'fighter', position: { x: 1, y: 1 }, fuel: 30, ammo: 1 }),
      unit({ id: 'far', kind: 'tank', position: { x: 3, y: 1 }, fuel: 3, ammo: 0 }),
    ]));
    const byId = (id: string) => next.units.find(candidate => candidate.id === id)!;
    expect(byId('tank')).toMatchObject({ fuel: unitStats.tank.fuel, ammo: unitStats.tank.ammo, hp: 100 });
    expect(byId('cargo')).toMatchObject({ ammo: unitStats.infantry.ammo });
    expect(byId('fighter')).toMatchObject({ fuel: 25, ammo: 1 });
    expect(byId('far')).toMatchObject({ fuel: 3, ammo: 0 });
    // A supply vehicle does not resupply itself.
    expect(byId('apc')).toMatchObject({ fuel: 20, ammo: 2 });
  });

  it('does not supply anything under classic rules', () => {
    const board = createBoard(3, 1);
    const state = { ...modernBeforeRedTurn(board, [
      unit({ id: 'apc', kind: 'apc', position: { x: 1, y: 0 } }),
      unit({ id: 'tank', kind: 'tank', position: { x: 2, y: 0 }, fuel: 3, ammo: 0 }),
    ]), ruleVersion: undefined };
    expect(endTurn(state).units[1]).toMatchObject({ fuel: 3, ammo: 0 });
  });
});

describe('modern CPU resupply scoring', () => {
  it('sends a low-fuel aircraft to an airport rather than a city under modern rules only', () => {
    const board = createBoard(3, 1);
    board.terrain[0]![0] = { kind: 'city', owner: 'red', capturePoints: 20 };
    board.terrain[0]![2] = { kind: 'airport', owner: 'red', capturePoints: 20 };
    const fighter = unit({ id: 'f', kind: 'fighter', position: { x: 1, y: 0 }, fuel: 8 }) as DeployedUnit;
    const score = (state: GameState, x: number) =>
      evaluateCpuPosition(state, 'red', fighter, { x, y: 0 }, [], cpuDifficultyConfig.normal, []);
    const modern = { ...createGameState(board), ruleVersion: MODERN_RULE_VERSION, units: [fighter] };
    const classic = { ...modern, ruleVersion: undefined };
    expect(score(modern, 2) - score(modern, 0)).toBeGreaterThanOrEqual(80);
    expect(score(classic, 2) - score(classic, 0)).toBeLessThan(80);
  });
});

describe('rule version persistence compatibility', () => {
  const scenarioData: ScenarioData = {
    id: 'rule-version-test', name: 'ルール互換', briefing: '', startingGold: 0,
    board: { width: 4, height: 1, cells: [[0, 0, 'city', 'red'], [3, 0, 'capital', 'blue']] },
    initialUnits: [{ kind: 'bomber', owner: 'red', x: 0, y: 0 }, { kind: 'infantry', owner: 'blue', x: 2, y: 0 }],
    victoryConditions: [{ type: 'eliminate' }], defeatConditions: [{ type: 'eliminate' }],
  };
  const saved = saveCustomScenario(new MemoryStorage(), scenarioData);
  if (!saved.ok) throw new Error(saved.error);
  const scenario = saved.value;
  const modernInitial = () => createScenarioInitialState(scenario);
  const classicInitial = (): GameState => ({ ...modernInitial(), ruleVersion: undefined });
  const commands: GameCommand[] = [{ type: 'endTurn' }, { type: 'endTurn' }];
  const play = (initial: GameState) => {
    const result = replayCommands(initial, commands);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };
  const save = (initial: GameState, gameState: GameState) => {
    const storage = new MemoryStorage();
    const result = saveGame(storage, 'save', { mapId: scenario.id, difficulty: 'normal', initialState: initial, commands, gameState });
    return { result, raw: storage.getItem('save') };
  };

  it('starts new scenario matches with modern rules', () => {
    // New matches use the latest rule version (3 since #119); v2 and classic states still replay.
    expect(modernInitial().ruleVersion).toBe(CURRENT_RULE_VERSION);
    expect(matchesScenarioInitialState(modernInitial(), scenario)).toBe(true);
    expect(matchesScenarioInitialState(classicInitial(), scenario)).toBe(true);
    expect(matchesScenarioInitialState({ ...modernInitial(), turn: 2 }, scenario)).toBe(false);
  });

  it('loads a pre-Phase 9 save and replays it with the classic rules it was recorded with', () => {
    // Classic rules refuel the bomber on any owned property; modern rules do not.
    expect(play(classicInitial()).units[0]!.fuel).toBe(unitStats.bomber.fuel);
    expect(play(modernInitial()).units[0]!.fuel).toBe(unitStats.bomber.fuel - unitStats.bomber.fuelPerTurn);

    const classic = save(classicInitial(), play(classicInitial()));
    expect(classic.result.ok).toBe(true);
    const parsed = parseSavedGame(classic.raw!);
    expect(parsed.ok && parsed.value.gameState.ruleVersion).toBeUndefined();

    const modern = save(modernInitial(), play(modernInitial()));
    expect(parseSavedGame(modern.raw!).ok).toBe(true);
  });

  it('rejects a save whose rule version does not match its command history', () => {
    const mixed = save(classicInitial(), play(modernInitial()));
    expect(mixed.result.ok).toBe(true);
    expect(parseSavedGame(mixed.raw!)).toMatchObject({ ok: false });
  });

  it('creates and summarizes replays from pre-Phase 9 initial states', () => {
    const finishing: GameCommand[] = [{ type: 'move', unitId: 'r1', destination: { x: 1, y: 0 } }, { type: 'attack', unitId: 'r1', targetId: 'b1' }];
    const summary = summarizeReplay(classicInitial(), finishing, scenario.id, 'normal');
    expect(summary).toMatchObject({ ok: true, value: { winner: 'red', kills: { red: 1, blue: 0 } } });
    const replay = createReplay({ mapId: scenario.id, difficulty: 'normal', initialState: classicInitial(), commands: finishing });
    expect(replay.ok).toBe(true);
    expect(replay.ok && replay.value.initialState.ruleVersion).toBeUndefined();
    const serialized = replay.ok ? serializeReplay(replay.value) : undefined;
    expect(serialized?.ok && parseReplay(serialized.value).ok).toBe(true);
  });

  it('rejects unknown rule versions and experience on classic states', () => {
    expect(isGameState(modernInitial())).toBe(true);
    // Rule version 3 became valid in #119; versions outside the known set are still rejected.
    expect(isGameState({ ...modernInitial(), ruleVersion: 1 })).toBe(false);
    expect(isGameState({ ...modernInitial(), ruleVersion: 4 })).toBe(false);
    const classic = classicInitial();
    expect(isGameState({ ...classic, units: classic.units.map(candidate => ({ ...candidate, experience: 1 })) })).toBe(false);
  });
});
