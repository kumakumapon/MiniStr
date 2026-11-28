import { FourArmyReplay } from '../ui/fourArmyReplay';
import { expect, it } from 'vitest';
import { chooseFourArmyCpuCommand, defaultFourArmyCpuSettings, isObservedFourArmyCommand } from '../ai/fourArmyCpu';
import { encirclementAllianceLimit, encirclementHegemonLimit, startingSiteResources } from './asymmetricBattlefield';
import { createExpandedBattleMap } from './expandedBattleMap';
import { parseFourArmyArchive, serializeFourArmyArchive } from './fourArmyArchive';
import { applyFourArmyCommand, createFourArmyState, observeFourArmy, type FourArmyCommand } from './fourArmyEngine';
import { battleWinners, fourArmyUnitLimit } from './smallBattle';
import type { GameResult } from './types';

const unwrap = <T>(result: GameResult<T>): T => {
  if (!result.ok) throw Error(result.error);
  return result.value;
};
const setup = {
  sourceMapId: 'encirclement',
  siteArmies: ['army3', 'army1', 'army2', 'army4'],
  order: ['army1', 'army4', 'army2', 'army3'],
  seed: 341101,
  rules: { version: 1, tactics: true },
} as const;

it('ties teams, capped rosters and starting resources to the sites instead of the initiative order', () => {
  const map = unwrap(createExpandedBattleMap(setup));
  expect(map.match).toMatchObject({
    layoutVersion: 7,
    siteArmies: setup.siteArmies,
    initialOrder: setup.order,
    teams: { army1: 'army1', army2: 'army1', army3: 'army3', army4: 'army1' },
    sharedVision: true,
  });
  expect(map.board).toMatchObject({ width: 18, height: 14 });
  expect(map.board.terrain[5]!.map((tile, x) => (tile.kind === 'road' ? x : -1)).filter((x) => x >= 0)).toEqual([3, 8, 14]);
  for (const [site, army] of setup.siteArmies.entries()) {
    const resources = startingSiteResources('encirclement', site);
    expect(map.players[army].gold).toBe(resources.gold);
    expect(map.units.filter((unit) => unit.owner === army).map((unit) => unit.kind)).toEqual(resources.units.map(([kind]) => kind));
    expect(
      map.board.terrain
        .flat()
        .filter((tile) => tile.owner === army)
        .map((tile) => tile.kind)
        .sort(),
    ).toEqual(['capital', ...resources.facilities.map(([kind]) => kind)].sort());
    expect(fourArmyUnitLimit(map.match, map.setup!.unitLimitPerArmy, army)).toBe(site === 0 ? encirclementHegemonLimit : encirclementAllianceLimit);
  }
  for (const change of [
    { participants: ['army1', 'army2', 'army3'] as const },
    { layoutVersion: 6 as const },
    { sharedVision: false },
    { teams: { army4: 'army4' as const } },
    { siteArmies: ['army3', 'army1', 'army1', 'army4'] as const },
  ]) {
    expect(createExpandedBattleMap({ ...setup, ...change }).ok).toBe(false);
  }
});

it('uses the coalition ceiling for observed and committed production and exposes same-team vision', () => {
  const map = unwrap(createExpandedBattleMap(setup));
  let state = unwrap(createFourArmyState(map));
  const first = unwrap(observeFourArmy(state, 'army1'));
  expect(first.visible).toContainEqual(map.capitals.army2);
  expect(first.player.gold).toBe(state.players.army1.gold);
  expect(first).not.toHaveProperty('players');
  const factory = { x: 2, y: 9 };
  const produce = { type: 'produce', actor: 'army1', factory, kind: 'infantry' } as const;
  expect(isObservedFourArmyCommand(first, produce)).toBe(true);
  for (let x = 1; state.units.filter((unit) => unit.owner === 'army1').length < encirclementAllianceLimit; x--) {
    state = unwrap(applyFourArmyCommand(state, produce));
    state.units.find((unit) => unit.owner === 'army1' && unit.position?.x === factory.x && unit.position.y === factory.y)!.position = { x, y: 9 };
  }
  const observation = unwrap(observeFourArmy(state, 'army1'));
  expect(state.units.filter((unit) => unit.owner === 'army1')).toHaveLength(encirclementAllianceLimit);
  expect(isObservedFourArmyCommand(observation, produce)).toBe(false);
  expect(applyFourArmyCommand(state, produce).ok).toBe(false);
  const choice = chooseFourArmyCpuCommand(observation, defaultFourArmyCpuSettings().army1, 'four-army-cpu-v7');
  expect(choice?.type).not.toBe('produce');
});

it('round-trips the fixed teams, rejects changed canonical resources and awards victory to all allied sites', async () => {
  const map = unwrap(createExpandedBattleMap(setup));
  const initial = unwrap(createFourArmyState(map));
  const command = { type: 'endTurn', actor: 'army1' } satisfies FourArmyCommand;
  const next = unwrap(applyFourArmyCommand(initial, command));
  const raw = unwrap(serializeFourArmyArchive(map, [command], next));
  const archive = unwrap(parseFourArmyArchive(raw));
  expect(archive.payload).toEqual({ map, commands: [command], state: next });
  expect(unwrap(createFourArmyState(archive.payload.map))).toEqual(initial);
  const replay = new FourArmyReplay(archive.payload.map, archive.payload.commands);
  expect(await replay.seek(1)).toEqual(next);
  expect(await replay.seek(0)).toEqual(initial);
  for (const change of ['funds', 'team', 'limit'] as const) {
    const altered = structuredClone(archive);
    const input = altered.payload.map;
    if (change === 'funds') input.players.army3.gold += 1000;
    if (change === 'limit') input.setup!.unitLimitPerArmy += 1;
    if (change === 'team' && input.match?.version === 2) input.match.teams.army2 = 'army2';
    expect(parseFourArmyArchive(JSON.stringify(altered)).ok).toBe(false);
  }
  const captured = structuredClone(initial);
  const home = captured.capitals.army3;
  const attacker = captured.units.find((unit) => unit.owner === 'army1' && unit.kind === 'infantry')!;
  const defender = captured.units.find((unit) => unit.position?.x === home.x && unit.position.y === home.y);
  if (defender) defender.position = { x: home.x - 1, y: home.y - 1 };
  attacker.position = home;
  captured.board.terrain[home.y]![home.x]!.capturePoints = 1;
  const won = unwrap(applyFourArmyCommand(captured, { type: 'capture', actor: 'army1', unitId: attacker.id }));
  expect(battleWinners(won)).toEqual(['army1', 'army2', 'army4']);
  expect(won.decision).toBeUndefined();
});
