import { expect, it } from 'vitest';
import { isObservedFourArmyCommand, chooseFourArmyCpuCommand } from '../ai/fourArmyCpu';
import { crossingDistances } from '../ai/crossing';
import { asymmetricDuelData } from './asymmetricDuels';
import { authoredBattlefield, authoredFourSources } from './asymmetricFourSites';
import { createExpandedBattleMap } from './expandedBattleMap';
import { parseFourArmyArchive, serializeFourArmyArchive } from './fourArmyArchive';
import { applyFourArmyCommand, createFourArmyState, observeFourArmy } from './fourArmyEngine';
import { alliedArmies } from './smallBattle';
import { applyGameCommand, createScenarioInitialState, scenarioById, tacticalScenario } from './index';
import { positionKey, unitMovementCost } from './terrain';
import { LOGISTICS_RULE_VERSION, type GameResult, type GameState } from './types';

function value<T>(result: GameResult<T>): T {
  if (!result.ok) throw Error(result.error);
  return result.value;
}

it.each(asymmetricDuelData.map((data) => data.id))('keeps playable deployments and objectives with either tactical option in %s', (id) => {
  const map = scenarioById(id)!;
  expect(map.id).toBe(id);
  expect(map.victoryConditions.length).toBeGreaterThan(0);
  expect(map.defeatConditions.length).toBeGreaterThan(0);
  expect(tacticalScenario(map).board).toEqual(map.board);
  for (const scenario of [map, tacticalScenario(map)]) {
    const state = { ...createScenarioInitialState(scenario), ruleVersion: LOGISTICS_RULE_VERSION };
    expect(value(applyGameCommand(state, { type: 'endTurn' })).activePlayer).toBe('blue');
    for (const unit of state.units) expect(unitMovementCost(state, unit.position!, unit.kind)).toBeLessThan(Infinity);
  }
});

it('leaves a sea route from both mainland landing ships to the island shore', () => {
  const map = scenarioById('island-fortress')!;
  const state = { ...createScenarioInitialState(map), ruleVersion: LOGISTICS_RULE_VERSION };
  const redHQ = { x: 3, y: 5 };
  const ground = crossingDistances(state, 'infantry', [redHQ]);
  for (const ship of state.units.filter((u) => u.owner === 'blue' && u.kind === 'landingShip')) {
    expect(ground.has(positionKey({ x: ship.position!.x + 1, y: ship.position!.y }))).toBe(false);
    const sea = crossingDistances(state, 'landingShip', [ship.position!]);
    expect(
      [...sea.keys()].some((k) => {
        const [x, y] = k.split(',').map(Number);
        return [
          { x: x! - 1, y: y! },
          { x: x! + 1, y: y! },
          { x: x!, y: y! - 1 },
          { x: x!, y: y! + 1 },
        ].some((p) => ground.has(positionKey(p)));
      }),
    ).toBe(true);
  }
});

it('resolves relief and siege as different ownership objectives', () => {
  const map = scenarioById('relief-corridor')!;
  const initial = { ...createScenarioInitialState(map), ruleVersion: LOGISTICS_RULE_VERSION };
  const finish = (side: 'red' | 'blue') => {
    let s: GameState = structuredClone(initial);
    const hold = (side === 'red' ? map.victoryConditions : map.defeatConditions).find((c) => c.type === 'hold')!;
    const troops = s.units.filter((unit) => unit.owner === side && unit.kind === 'infantry');
    for (const [i, { x, y }] of hold.positions.entries()) {
      s.board.terrain[y]![x]!.owner = side;
      troops[i]!.position = { x, y };
    }
    for (let i = 0; i < hold.turns * 2 && !s.winner; i++) s = value(applyGameCommand(s, { type: 'endTurn' }));
    return s;
  };
  expect(finish('red').winner).toBe('red');
  expect(finish('blue').winner).toBe('blue');
});

it.each(authoredFourSources)('round-trips and validates four ordered sites in %s', (sourceMapId) => {
  const sites = ['army3', 'army1', 'army4', 'army2'] as const;
  const order = ['army2', 'army4', 'army3', 'army1'] as const;
  const map = value(createExpandedBattleMap({ sourceMapId, siteArmies: sites, order, rules: { version: 1, tactics: true } }));
  expect(map.match).toMatchObject({ layoutVersion: 8, siteArmies: sites, initialOrder: order });
  const spec = authoredBattlefield(sourceMapId);
  for (const [i, army] of sites.entries()) {
    expect(map.players[army].gold).toBe(spec.sites[i]!.gold);
    for (const [kind, x, y] of spec.sites[i]!.facilities) expect(map.board.terrain[y]![x]).toMatchObject({ kind, owner: army });
    for (const [j, other] of sites.entries()) expect(alliedArmies(map.match, army, other)).toBe(i === j || (!!spec.teams && spec.teams[i] === spec.teams[j]));
  }
  const state = value(createFourArmyState(map));
  const observation = value(observeFourArmy(state, order[0]));
  const action = chooseFourArmyCpuCommand(observation, { difficulty: 'normal', policy: 'balanced' }, 'four-army-cpu-v7')!;
  expect(isObservedFourArmyCommand(observation, action)).toBe(true);
  const next = value(applyFourArmyCommand(state, action));
  const save = value(serializeFourArmyArchive(map, [action], next));
  const parsed = value(parseFourArmyArchive(save));
  expect(parsed.payload).toEqual({ map, commands: [action], state: next });
  parsed.payload.map.players[sites[0]].gold++;
  expect(parseFourArmyArchive(JSON.stringify(parsed)).ok).toBe(false);
  expect(createExpandedBattleMap({ sourceMapId, layoutVersion: 7 }).ok).toBe(false);
});
