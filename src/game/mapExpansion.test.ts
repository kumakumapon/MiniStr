import { describe, expect, it } from 'vitest';
import { chooseCpuAction } from '../ai';
import {
  applyGameCommand,
  createScenarioInitialState,
  createReplay,
  DECISION_RULE_VERSION,
  endTurn,
  isDeployedUnit,
  legacyBuiltInScenarioData,
  loadScenarioDefinitions,
  maps,
  movementCost,
  parseReplay,
  parseSavedGame,
  reachablePositions,
  replayCommands,
  saveGame,
  scenarioHistory,
  scenarioDefinitionToData,
  unitLimit,
  unitStats,
  usesDecisionRules,
  withEvaluatedWinner,
  type GameCommand,
  type GameState,
} from './index';

describe('expanded battlefields', () => {
  it('expands every existing battlefield and keeps initial units on legal terrain', () => {
    for (const scenario of maps) {
      const legacy = legacyBuiltInScenarioData.find((map) => map.id === scenario.id)!;
      expect(scenario.board.width).toBeGreaterThan(legacy.board.width);
      expect(scenario.board.height).toBeGreaterThan(legacy.board.height);
      expect(scenario.board.width * scenario.board.height).toBeGreaterThanOrEqual(2 * legacy.board.width * legacy.board.height);
      for (const unit of scenario.initialUnits) expect(Number.isFinite(movementCost(scenario.board, unit, unit.kind)), `${scenario.id}: ${unit.kind}`).toBe(true);
    }
  });

  it('prevents an opening attack before the opponent can deploy', () => {
    for (const scenario of maps.filter((map) => map.id !== 'tundra')) {
      const state = createScenarioInitialState(scenario);
      for (const unit of state.units.filter(isDeployedUnit)) {
        const stats = unitStats[unit.kind];
        const positions = stats.indirect ? [unit.position] : [unit.position, ...reachablePositions({ ...state, activePlayer: unit.owner }, unit.id)];
        for (const enemy of state.units.filter(isDeployedUnit).filter((enemy) => enemy.owner !== unit.owner)) {
          expect(
            positions.some((position) => {
              const distance = Math.abs(position.x - enemy.position.x) + Math.abs(position.y - enemy.position.y);
              return stats.attack > 0 && distance >= stats.range[0] && distance <= stats.range[1];
            }),
            `${scenario.id}: ${unit.id} can attack ${enemy.id} in the opening`,
          ).toBe(false);
        }
      }
    }
  });

  it('gives outpost both sides the same victory objectives without an automatic blue deadline win', () => {
    const scenario = maps.find((map) => map.id === 'outpost')!;
    expect(scenario.turnLimit).toBeUndefined();
    expect(scenario.defeatConditions).toEqual(scenario.victoryConditions);
  });
});

describe('balanced opening rules', () => {
  it('grants the opening compensation once and preserves it in the scenario snapshot', () => {
    const scenario = maps.find((map) => map.id === 'skirmish')!;
    const initial = createScenarioInitialState(scenario);
    expect(initial.players.blue.gold).toBe(scenario.startingGold + 4000);
    expect(initial.scenarioSnapshot?.secondPlayerBonus).toBe(4000);
    const firstBlue = endTurn(initial);
    const secondBlue = endTurn(endTurn(firstBlue));
    expect(secondBlue.players.blue.gold - firstBlue.players.blue.gold).toBe(secondBlue.players.blue.income);
  });

  it.each([-1, 0.5, 1000001, '1000'])('rejects an invalid compensation value %s', (bonus) => {
    expect(loadScenarioDefinitions([{ ...scenarioDefinitionToData(maps[0]!), secondPlayerBonus: bonus }]).ok).toBe(false);
  });
  it('gives blue its matching scoring turn, compares scores, and continues ties', () => {
    const scenario = maps.find((map) => map.id === 'industrial')!;
    const scored = { ...createScenarioInitialState(scenario), turn: 14, scores: { red: 18, blue: 17 } };
    expect(withEvaluatedWinner(scored).winner).toBeUndefined();
    const blue = endTurn(scored);
    expect(blue.winner).toBeUndefined();
    expect(endTurn(blue).winner).toBe('red');
    expect(endTurn({ ...blue, scores: { red: 18, blue: 18 } }).winner).toBeUndefined();
    expect(endTurn({ ...blue, scores: { red: 18, blue: 19 } }).winner).toBe('blue');
    expect(withEvaluatedWinner({ ...scored, ruleVersion: DECISION_RULE_VERSION }).winner).toBe('red');
    expect(scenario.defeatConditions).toEqual(scenario.victoryConditions);
  });
  it.each(['islands', 'canyon', 'admiralty'])('gives both sides full opening fuel on %s and charges later upkeep', (id) => {
    const scenario = maps.find((map) => map.id === id)!;
    const initial = createScenarioInitialState(scenario);
    const blue = endTurn(initial);
    for (const unit of blue.units) expect(unit.fuel).toBe(unitStats[unit.kind].fuel);
    const redSecond = endTurn(blue);
    const redShipOrAircraft = initial.units.find((unit) => unit.owner === 'red' && unitStats[unit.kind].fuelPerTurn > 0)!;
    expect(redSecond.units.find((unit) => unit.id === redShipOrAircraft.id)?.fuel).toBe(unitStats[redShipOrAircraft.kind].fuel - unitStats[redShipOrAircraft.kind].fuelPerTurn);
    const blueSecond = endTurn(redSecond);
    const blueShipOrAircraft = initial.units.find((unit) => unit.owner === 'blue' && unitStats[unit.kind].fuelPerTurn > 0)!;
    expect(blueSecond.units.find((unit) => unit.id === blueShipOrAircraft.id)?.fuel).toBe(unitStats[blueShipOrAircraft.kind].fuel - unitStats[blueShipOrAircraft.kind].fuelPerTurn);
  });

  it('preserves historical opening upkeep for version 3 matches', () => {
    const initial = { ...createScenarioInitialState(scenarioHistory('islands')[0]!), ruleVersion: DECISION_RULE_VERSION };
    const blue = endTurn(initial);
    const ship = blue.units.find((unit) => unit.owner === 'blue' && unit.kind === 'destroyer')!;
    expect(ship.fuel).toBe(unitStats.destroyer.fuel - unitStats.destroyer.fuelPerTurn);
  });

  it('caps two large armies at the interactive budget while keeping version 3 limits', () => {
    const board = maps.find((map) => map.id === 'siege')!.board;
    expect(unitLimit(board)).toBe(64);
    expect(unitLimit(board, DECISION_RULE_VERSION)).toBe(Math.floor((board.width * board.height) / 4));
    expect(usesDecisionRules(createScenarioInitialState(maps[0]!))).toBe(true);
  });
});

describe('old small-map persistence', () => {
  const commands: GameCommand[] = [{ type: 'endTurn' }, { type: 'endTurn' }];
  const withoutSnapshot = (state: GameState) => ({ ...state, scenarioSnapshot: undefined });

  it.each(maps.map((map) => map.id))('restores a pre-snapshot save and replay of %s', (id) => {
    const old = scenarioHistory(id)[0]!;
    const initial = { ...createScenarioInitialState(old), ruleVersion: DECISION_RULE_VERSION };
    const replayed = replayCommands(initial, commands);
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) throw new Error(replayed.error);
    const storage = { setItem: () => {}, getItem: () => null, removeItem: () => {} };
    const saved = saveGame(storage, 'old', { mapId: id, difficulty: 'normal', initialState: initial, gameState: replayed.value, commands });
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error(saved.error);
    const parsedSave = parseSavedGame(JSON.stringify({ ...saved.value, schemaVersion: 3, initialState: withoutSnapshot(initial), gameState: withoutSnapshot(replayed.value) }));
    expect(parsedSave.ok).toBe(true);
    expect(parsedSave.ok && parsedSave.value.gameState.board).toEqual(old.board);
    const replayCommandsList: GameCommand[] = [];
    let finalState = initial as GameState;
    while (!finalState.winner && replayCommandsList.length < 10000 && finalState.turn <= 60) {
      const command = chooseCpuAction(finalState, 'easy');
      const applied = applyGameCommand(finalState, command);
      if (!applied.ok) throw new Error(applied.error);
      replayCommandsList.push(command);
      finalState = applied.value;
    }
    const replay = createReplay({ mapId: id, difficulty: 'easy', initialState: initial, commands: replayCommandsList });
    if (!replay.ok) throw new Error(replay.error);
    const parsedReplay = parseReplay(JSON.stringify({ ...replay.value, schemaVersion: 3, initialState: withoutSnapshot(initial), finalState: withoutSnapshot(finalState) }));
    expect(parsedReplay.ok).toBe(true);
    expect(parsedReplay.ok && parsedReplay.value.finalState).toEqual(finalState);
  });

  it('rejects a forged old-map opening instead of treating it as history', () => {
    const initial = { ...createScenarioInitialState(scenarioHistory('outpost')[0]!), ruleVersion: DECISION_RULE_VERSION };
    const replay = createReplay({ mapId: 'outpost', difficulty: 'normal', initialState: initial, commands: Array.from({ length: 40 }, () => ({ type: 'endTurn' as const })) });
    if (!replay.ok) throw new Error(replay.error);
    const forged = withoutSnapshot(initial);
    forged.players.red.gold += 1;
    expect(parseReplay(JSON.stringify({ ...replay.value, initialState: forged, finalState: forged })).ok).toBe(false);
  });
});
