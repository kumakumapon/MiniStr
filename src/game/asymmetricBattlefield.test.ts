import { describe, it, expect } from 'vitest';
import { createExpandedBattleMap } from './expandedBattleMap';
import { createFourArmyState, applyFourArmyCommand, type FourArmyCommand, isFourArmyState } from './fourArmyEngine';
import { parseFourArmyArchive, serializeFourArmyArchive } from './fourArmyArchive';
import { FOUR_ARMY_IDS } from './fourArmyFoundation';
import { fourArmyControllers } from './fourArmyControl';
import { initialFourArmyExperience, advanceFourArmyExperience, fourArmyExperienceManifest } from './fourArmyExperience';
import { encodeFourArmySpectatorSave, serializeFourArmySpectatorSave, parseFourArmySpectatorSave, type FourArmySpectatorSave } from './fourArmySpectatorSave';
import { defaultFourArmyCpuSettings } from '../ai/fourArmyCpu';
import { FourArmyReplay } from '../ui/fourArmyReplay';
import { terrainRules } from './terrain';
import { battleWinners, isSmallBattle } from './smallBattle';
import type { GameResult, Position } from './types';
const value = <T>(result: GameResult<T>) => {
  if (!result.ok) throw Error(result.error);
  return result.value;
};
describe.each(['canyon', 'marsh'] as const)('%s authored starting sites', (sourceMapId) => {
  it.each([3, 4])('keeps %i distinct sites, two exits and accessible objectives for every start', (count) => {
    const participants = FOUR_ARMY_IDS.slice(4 - count),
      siteArmies = [...participants].reverse(),
      order = [...participants.slice(1), participants[0]!];
    const map = value(createExpandedBattleMap({ sourceMapId, participants, siteArmies, order }));
    const normal = value(createExpandedBattleMap({ sourceMapId, participants }));
    expect(map.order).toEqual(order);
    expect(map.match).toMatchObject({ layoutVersion: 5, siteArmies, initialOrder: order });
    expect(Object.keys(map.players).sort()).toEqual(participants);
    expect(map.units).toHaveLength(count * 4);
    const targets = map.board.terrain.flatMap((r, y) => r.flatMap((tile, x) => (['capital', 'city', 'factory'].includes(tile.kind) ? [{ x, y }] : [])));
    const neighbors = (p: Position) => [
      { x: p.x + 1, y: p.y },
      { x: p.x - 1, y: p.y },
      { x: p.x, y: p.y + 1 },
      { x: p.x, y: p.y - 1 },
    ];
    for (const [i, a] of siteArmies.entries()) {
      const home = map.capitals[a];
      expect(home).toEqual(normal.capitals[participants[i]!]);
      expect(map.players[a].gold).toBe(6000);
      expect(map.units.filter((u) => u.owner === a).map((u) => u.kind)).toEqual(['infantry', 'infantry', 'recon', 'tank']);
      expect(
        map.board.terrain
          .flat()
          .filter((tile) => tile.owner === a)
          .map((t) => t.kind)
          .sort(),
      ).toEqual(['capital', 'city', 'factory']);
      for (const kind of ['infantry', 'tank'] as const) {
        const passable = (p: Position) => {
          const t = map.board.terrain[p.y]?.[p.x];
          return t && Number.isFinite(terrainRules[t.kind].movement[kind]);
        };
        const exits = neighbors(home).filter(passable);
        expect(exits.length).toBeGreaterThan(1);
        // Each possible single blocked first step still leaves routes to every objective.
        for (const blocked of exits) {
          const key = (p: Position) => p.x + ',' + p.y;
          const seen = new Set([key(blocked), key(home)]),
            queue = [home];
          for (let i = 0; i < queue.length; i++)
            for (const p of neighbors(queue[i]!))
              if (!seen.has(key(p)) && passable(p)) {
                seen.add(key(p));
                queue.push(p);
              }
          expect(targets.every((t) => seen.has(key(t)))).toBe(true);
        }
      }
    }
  });
  it.each([4, 5] as const)('layout %i rebuilds saved, replayed and rematched starts and refuses changed assignments and terrain', async (layoutVersion) => {
    const participants = ['army1', 'army3', 'army4'] as const,
      siteArmies = ['army4', 'army1', 'army3'] as const,
      order = ['army3', 'army4', 'army1'] as const;
    const map = value(createExpandedBattleMap({ sourceMapId, participants, siteArmies, order, layoutVersion, seed: 33 }));
    const initial = value(createFourArmyState(map));
    let state = initial,
      experience = initialFourArmyExperience(initial, 0);
    const commands: FourArmyCommand[] = [];
    while (state.outcome.type === 'ongoing') {
      const c: FourArmyCommand = { type: 'endTurn', actor: state.round.order[state.round.index]! };
      const after = value(applyFourArmyCommand(state, c));
      commands.push(c);
      experience = advanceFourArmyExperience(experience, state, c, after, commands.length);
      state = after;
    }
    const controllers = fourArmyControllers(['army4']);
    const save: FourArmySpectatorSave = {
      format: 'ministr-four-army-configurable',
      schemaVersion: 6,
      cpuVersion: 'four-army-cpu-v7',
      name: 'Sites',
      savedAt: '2026-11-27T00:00:00.000Z',
      settings: defaultFourArmyCpuSettings(),
      controllers,
      controlHistory: { initial: controllers, events: [] },
      experience: fourArmyExperienceManifest(experience),
      view: 'army4',
      speed: 1,
      archive: { format: 'ministr-four-army-save', schemaVersion: 5, ruleset: 'four-army-v5', payload: { map, state, commands } },
    };
    const file = value(serializeFourArmySpectatorSave(save)),
      loaded = value(parseFourArmySpectatorSave(file)).archive.payload;
    expect(loaded.state).toEqual(state);
    expect(value(createFourArmyState(loaded.map))).toEqual(initial);
    const replay = new FourArmyReplay(loaded.map, loaded.commands);
    expect(await replay.seek(commands.length)).toEqual(state);
    expect(await replay.seek(0)).toEqual(initial);
    for (const change of ['sites', 'terrain'] as const) {
      const altered = structuredClone(save);
      const m = altered.archive.payload.map;
      if (change === 'sites' && m.match?.version === 2) m.match.siteArmies = [...participants];
      else m.board.terrain[0]![0] = { kind: 'forest' };
      expect(parseFourArmySpectatorSave(value(encodeFourArmySpectatorSave(altered))).ok).toBe(false);
    }
    for (const patch of [
      { siteArmies: undefined },
      { siteArmies: order.slice(1) },
      { siteArmies: ['army4', 'army4', 'army3'] },
      { layoutVersion: 6 },
      { siteArmies: ['army1', 'army2', 'army3'] },
    ])
      expect(isSmallBattle({ ...map.match, ...patch })).toBe(false);
  });
});
it('keeps original presets strict and the authored layouts open only to 3 or 4 independent armies', () => {
  expect(createExpandedBattleMap({ sourceMapId: 'canyon', participants: ['army2', 'army4'] }).ok).toBe(false);
  expect(createExpandedBattleMap({ sourceMapId: 'marsh', teams: { army1: 'army2' } }).ok).toBe(false);
  expect(createExpandedBattleMap({ sourceMapId: 'skirmish', siteArmies: FOUR_ARMY_IDS }).ok).toBe(false);
  expect(createExpandedBattleMap({ sourceMapId: 'outpost', layoutVersion: 4 }).ok).toBe(false);
});

const defense = { sourceMapId: 'tundra', participants: ['army1', 'army3', 'army4'], siteArmies: ['army4', 'army1', 'army3'], order: ['army3', 'army4', 'army1'] } as const;
it('awards the northern defender the deadline with a surviving headquarters and unit', () => {
  const map = value(createExpandedBattleMap(defense));
  expect(map.match).toMatchObject({ roundLimit: 15, teams: { army4: 'army4', army3: 'army1', army1: 'army1' }, sharedVision: true });
  let s = value(createFourArmyState(map));
  const commands: FourArmyCommand[] = [];
  for (let turn = 0; turn < 45; turn++) {
    expect(s.outcome.type).toBe('ongoing');
    const command: FourArmyCommand = { type: 'endTurn', actor: s.round.order[s.round.index]! };
    s = value(applyFourArmyCommand(s, command));
    commands.push(command);
  }
  expect(value(parseFourArmyArchive(value(serializeFourArmyArchive(map, commands, s)))).payload.state).toEqual(s);
  expect(s.decision).toEqual({ round: 15 });
  expect(battleWinners(s)).toEqual(['army4']);
  expect(isFourArmyState(s)).toBe(true);
  expect(isFourArmyState({ ...s, outcome: { type: 'victory', winner: 'army1' } })).toBe(false);
});
it('ends immediately when the northern headquarters falls to either allied attacker', () => {
  const map = value(createExpandedBattleMap(defense));
  let s = value(createFourArmyState(map));
  const home = s.capitals.army4;
  const u = s.units.find((u) => u.owner === 'army3' && u.kind === 'infantry')!;
  u.position = { ...home };
  s.board.terrain[home.y]![home.x]!.capturePoints = 1;
  s = value(applyFourArmyCommand(s, { type: 'capture', actor: 'army3', unitId: u.id }));
  expect(battleWinners(s)).toEqual(['army1', 'army3']);
  expect(s.decision).toBeUndefined();
  expect(isFourArmyState(s)).toBe(true);
});
it('refuses other roles, deadlines, old layouts or unsupported army counts in defense', () => {
  for (const options of [
    { ending: 'unlimited' } as const,
    { layoutVersion: 4 } as const,
    { teams: { army4: 'army1' } as const },
    { sharedVision: false },
    { participants: FOUR_ARMY_IDS, siteArmies: FOUR_ARMY_IDS, order: FOUR_ARMY_IDS },
  ])
    expect(createExpandedBattleMap({ ...defense, ...options }).ok).toBe(false);
});
it.each([3, 4])('connects both river banks at three public bridges for %i armies', (count) => {
  const map = value(createExpandedBattleMap({ sourceMapId: 'river', participants: FOUR_ARMY_IDS.slice(0, count) }));
  expect(map.bridges).toHaveLength(3);
  expect(map.board.terrain[6]!.every((t) => t.kind === 'sea')).toBe(true);
  for (const { position: p } of map.bridges!) for (const y of [p.y - 1, p.y + 1]) expect(Number.isFinite(terrainRules[map.board.terrain[y]![p.x]!.kind].movement.tank)).toBe(true);
});
