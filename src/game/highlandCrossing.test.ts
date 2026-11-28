import { expect, it } from 'vitest';
import { createScenarioInitialState, scenarioById } from './maps';
import { highlandCrossingId } from './highlandCrossing';
import { adjacentCells } from './tactics';
import { movementCost, positionKey } from './terrain';
import { tacticalScenario } from './tacticalMaps';

const map = scenarioById(highlandCrossingId)!;

it.each([false, true])('provides three crossings and an approach to the opposing HQ for every initial unit (tactics=%s)', (withTactics) => {
  const scenario = withTactics ? tacticalScenario(map) : map;
  const { board } = scenario;
  expect(board.width).toBe(18);
  expect(board.height).toBe(12);
  expect(board.terrain[5]!.filter((tile) => tile.kind === 'road')).toHaveLength(3);
  expect(board.terrain[5]!.filter((tile) => tile.kind === 'sea')).toHaveLength(15);
  expect(scenario.victoryConditions).toEqual([{ type: 'eliminate' }, { type: 'captureCapital' }]);
  expect(scenario.defeatConditions).toEqual(scenario.victoryConditions);
  for (const unit of scenario.initialUnits) {
    const [enemyHQ] = board.terrain.flatMap((row, y) => row.flatMap((tile, x) => (tile.kind === 'capital' && tile.owner !== unit.owner ? [{ x, y }] : [])));
    const pending = [{ x: unit.x, y: unit.y }];
    const seen = new Set([positionKey(unit)]);
    for (let index = 0; index < pending.length; index++) {
      for (const next of adjacentCells(pending[index]!)) {
        if (seen.has(positionKey(next)) || !Number.isFinite(movementCost(board, next, unit.kind))) continue;
        pending.push(next);
        seen.add(positionKey(next));
      }
    }
    expect(seen.has(positionKey(enemyHQ!)), `${unit.owner} ${unit.kind} at ${positionKey(unit)}`).toBe(true);
  }
});

it('distinguishes the northern highlands and the southern production base', () => {
  const { board } = map;
  expect(
    board.terrain
      .slice(0, 5)
      .flat()
      .filter((tile) => tile.kind === 'mountain').length,
  ).toBeGreaterThan(
    board.terrain
      .slice(6)
      .flat()
      .filter((tile) => tile.kind === 'mountain').length,
  );
  expect(map).toMatchObject({ startingGold: 5000, firstPlayerBonus: 6000, decisionRound: 40 });
  const northernNeutral = board.terrain
    .slice(0, 5)
    .flat()
    .filter((tile) => !tile.owner);
  expect(northernNeutral.filter((tile) => tile.kind === 'factory')).toHaveLength(1);
  expect(northernNeutral.filter((tile) => tile.kind === 'airport')).toHaveLength(1);
  const commonForces = ['artillery', 'engineer', 'infantry', 'infantry', 'tank'];
  const state = createScenarioInitialState(map);
  for (const owner of ['red', 'blue'] as const) {
    const owned = board.terrain.flat().filter((tile) => tile.owner === owner);
    expect(owned.filter((tile) => tile.kind === 'city')).toHaveLength(3);
    expect(owned.filter((tile) => tile.kind === 'factory')).toHaveLength(owner === 'red' ? 1 : 2);
    expect(owned.filter((tile) => tile.kind === 'airport')).toHaveLength(owner === 'red' ? 0 : 1);
    const expectedUnits = owner === 'red' ? ['antiAir', ...commonForces] : commonForces;
    expect(
      state.units
        .filter((unit) => unit.owner === owner)
        .map((unit) => unit.kind)
        .sort(),
    ).toEqual(expectedUnits);
  }
  expect(state.players.red.gold).toBe(map.startingGold + map.firstPlayerBonus! + state.players.red.income);
  expect(state.players.blue.gold).toBe(map.startingGold);
});
