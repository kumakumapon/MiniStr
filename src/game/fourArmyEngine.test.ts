import { describe, expect, it } from 'vitest';
import { FOUR_ARMY_IDS, type FourArmyId } from './fourArmyFoundation';
import {
  applyFourArmyCommand,
  createFourArmyState,
  isFourArmyCommand,
  isFourArmyState,
  observeFourArmy,
  type FourArmyCommand,
  type FourArmyMap,
  type FourArmyState,
  type FourArmyUnit,
} from './fourArmyEngine';
import { parseFourArmyArchive, serializeFourArmyArchive } from './fourArmyArchive';
import { unitStats } from './units';
import { parseSavedGame } from './session';
import { parseReplay } from './replay';
import { parseResearch } from './research';
import { previewSaveRecovery } from './saveRecovery';
import type { GameResult, Position, UnitKind } from './types';

const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const unit = (id: string, owner: FourArmyId, position: Position, kind: UnitKind = 'infantry'): FourArmyUnit => ({
  id,
  owner,
  position,
  kind,
  hp: 100,
  fuel: unitStats[kind].fuel,
  ammo: unitStats[kind].ammo,
  hasMoved: false,
  hasActed: false,
});
function fixture(): FourArmyMap {
  const corners = [
    { x: 0, y: 0 },
    { x: 7, y: 0 },
    { x: 7, y: 7 },
    { x: 0, y: 7 },
  ];
  const capitals = Object.fromEntries(FOUR_ARMY_IDS.map((a, i) => [a, corners[i]!])) as FourArmyMap['capitals'];
  const board: FourArmyMap['board'] = { width: 8, height: 8, terrain: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({ kind: 'plain' }))) };
  for (const a of FOUR_ARMY_IDS) {
    const p = capitals[a];
    board.terrain[p.y]![p.x] = { kind: 'capital', owner: a, capturePoints: 20 };
  }
  return {
    id: 'four-engine-test',
    board,
    capitals,
    order: [...FOUR_ARMY_IDS],
    seed: 42,
    units: FOUR_ARMY_IDS.map((a, i) => unit(`a${i}`, a, { x: i === 0 || i === 3 ? 1 : 6, y: i < 2 ? 1 : 6 })),
    players: Object.fromEntries(FOUR_ARMY_IDS.map((a) => [a, { gold: 20000, income: 0 }])) as FourArmyMap['players'],
  };
}
function act(s: FourArmyState, c: Omit<FourArmyCommand, 'actor'>): FourArmyState {
  return value(applyFourArmyCommand(s, { ...c, actor: s.round.order[s.round.index] }));
}
function cycle(s: FourArmyState, n = 4): FourArmyState {
  for (let i = 0; i < n; i++) s = act(s, { type: 'endTurn' });
  return s;
}
function permutations<T>(a: readonly T[]): T[][] {
  return a.length ? a.flatMap((v, i) => permutations(a.filter((_, j) => i !== j)).map((rest) => [v, ...rest])) : [[]];
}

describe('four-army command engine', () => {
  it('runs all 24 orders through two rounds with independent income and equal opening fuel', () => {
    for (const order of permutations(FOUR_ARMY_IDS)) {
      const map = fixture();
      map.order = order;
      map.units = map.units.map((u) => ({ ...u, kind: 'fighter', fuel: 40, ammo: 6 }));
      let s = value(createFourArmyState(map));
      for (let i = 0; i < 8; i++) {
        const actor = order[i % 4]!;
        expect(s.round.order[s.round.index]).toBe(actor);
        expect(s.units.find((u) => u.owner === actor)!.fuel).toBe(i < 4 ? 40 : 35);
        expect(s.players[actor].gold).toBe(i < 4 ? 21000 : 22000);
        expect(isFourArmyState(s)).toBe(true);
        s = act(s, { type: 'endTurn' });
      }
      expect(s.round.round).toBe(3);
      expect(s.round.startedArmies).toHaveLength(4);
      expect(map.players.army1.gold).toBe(20000);
    }
  });
  it.each(['army2', 'army3', 'army4'] as const)('attacks %s without merging enemy identities or funds', (targetArmy) => {
    const map = fixture();
    map.units[0] = unit('attacker', 'army1', { x: 3, y: 3 }, 'tank');
    const enemy = map.units.find((u) => u.owner === targetArmy)!;
    enemy.position = { x: 4, y: 3 };
    const s = value(createFourArmyState(map));
    const before = structuredClone(s);
    const next = value(applyFourArmyCommand(s, { actor: 'army1', type: 'attack', unitId: 'attacker', targetId: enemy.id }));
    expect(next.units.find((u) => u.id === enemy.id)!.hp).toBeLessThan(100);
    expect(next.units.find((u) => u.id === enemy.id)!.owner).toBe(targetArmy);
    expect(next.rngSeed).not.toBe(s.rngSeed);
    expect(next.players).toEqual(s.players);
    expect(next.outcome.type).toBe('ongoing');
    expect(s).toEqual(before);
  });
  it('rejects the wrong actor, friendly fire, unknown fields and malformed commands atomically', () => {
    const s = value(createFourArmyState(fixture()));
    const before = structuredClone(s);
    for (const c of [
      { actor: 'army2', type: 'endTurn' },
      { actor: 'army1', type: 'attack', unitId: 'a0', targetId: 'a0' },
      { actor: 'army1', type: 'endTurn', gold: 10 },
      { actor: 'army1', type: 'move', unitId: 'a0', destination: { x: 2.1, y: 2 } },
      { actor: 'army1', type: 'dive', unitId: 'a0' },
      null,
    ])
      expect(applyFourArmyCommand(s, c).ok).toBe(false);
    expect(isFourArmyCommand({ actor: 'army1', type: 'resume', extra: true })).toBe(false);
    expect(s).toEqual(before);
  });
  it('keeps enemy visibility, cargo, logistics, RNG and funds out of an army observation', () => {
    const map = fixture();
    map.units.push(unit('hidden', 'army2', { x: 5, y: 3 }), unit('contact', 'army3', { x: 2, y: 1 }));
    const s = value(createFourArmyState(map));
    const observation = value(observeFourArmy(s, 'army1'));
    expect(observation.units.map((u) => u.id)).toEqual(['a0', 'contact']);
    expect(observation.units[1]!.owner).toBe('army3');
    expect(observation).not.toHaveProperty('players');
    expect(observation).not.toHaveProperty('rngSeed');
    observation.units[0]!.hp = 1;
    expect(s.units[0]!.hp).toBe(100);
  });
  it('rejects a hidden target even when another enemy army sees it', () => {
    const map = fixture();
    map.units[0] = unit('rocket', 'army1', { x: 1, y: 1 }, 'rocket');
    map.units[1]!.position = { x: 5, y: 1 };
    map.units[2]!.position = { x: 5, y: 2 };
    const s = value(createFourArmyState(map));
    expect(applyFourArmyCommand(s, { actor: 'army1', type: 'attack', unitId: 'rocket', targetId: 'a1' }).ok).toBe(false);
  });
  it('stops at first hidden contact without passing through it or leaking a failed command', () => {
    const map = fixture();
    map.units[1]!.position = { x: 4, y: 1 };
    const s = value(createFourArmyState(map));
    const next = value(applyFourArmyCommand(s, { actor: 'army1', type: 'move', unitId: 'a0', destination: { x: 4, y: 1 } }));
    expect(next.units[0]!.position).toEqual({ x: 3, y: 1 });
    expect(next.units[1]!.position).toEqual({ x: 4, y: 1 });
  });
  it('rejects impassable terrain and spends a valid move only once', () => {
    const map = fixture();
    map.board.terrain[1]![2] = { kind: 'sea' };
    const s = value(createFourArmyState(map));
    expect(applyFourArmyCommand(s, { actor: 'army1', type: 'move', unitId: 'a0', destination: { x: 2, y: 1 } }).ok).toBe(false);
    const next = value(applyFourArmyCommand(s, { actor: 'army1', type: 'move', unitId: 'a0', destination: { x: 1, y: 2 } }));
    expect(next.units[0]!.fuel).toBe(98);
    expect(applyFourArmyCommand(next, { actor: 'army1', type: 'move', unitId: 'a0', destination: { x: 1, y: 3 } }).ok).toBe(false);
  });
  it('embarks, moves and unloads the same-army cargo across turns; rejects an enemy transport', () => {
    const map = fixture();
    map.units.push(unit('carrier', 'army1', { x: 2, y: 1 }, 'apc'), unit('enemyCarrier', 'army2', { x: 1, y: 2 }, 'apc'));
    let s = value(createFourArmyState(map));
    expect(applyFourArmyCommand(s, { actor: 'army1', type: 'embark', unitId: 'a0', transportId: 'enemyCarrier' }).ok).toBe(false);
    s = value(applyFourArmyCommand(s, { actor: 'army1', type: 'embark', unitId: 'a0', transportId: 'carrier' }));
    expect(s.units[0]!.embarkedIn).toBe('carrier');
    expect(s.units[0]!.position).toBeUndefined();
    s = cycle(s);
    s = value(applyFourArmyCommand(s, { actor: 'army1', type: 'move', unitId: 'carrier', destination: { x: 3, y: 1 } }));
    s = cycle(s);
    s = value(applyFourArmyCommand(s, { actor: 'army1', type: 'disembark', transportId: 'carrier', destination: { x: 4, y: 1 } }));
    expect(s.units[0]!.position).toEqual({ x: 4, y: 1 });
    expect(s.units[0]!.embarkedIn).toBeUndefined();
  });
  it('removes a destroyed transport and its cargo, eliminates that army and neutralises its facilities', () => {
    const map = fixture();
    map.units[0] = unit('bomber', 'army1', { x: 3, y: 3 }, 'bomber');
    map.units[1] = { ...unit('carrier', 'army2', { x: 4, y: 3 }, 'apc'), hp: 1 };
    const cargo = unit('cargo', 'army2', { x: 4, y: 4 });
    delete cargo.position;
    cargo.embarkedIn = 'carrier';
    map.units.push(cargo);
    const s = value(createFourArmyState(map));
    const next = value(applyFourArmyCommand(s, { actor: 'army1', type: 'attack', unitId: 'bomber', targetId: 'carrier' }));
    expect(next.units.some((u) => u.owner === 'army2')).toBe(false);
    expect(next.alive).toEqual(['army1', 'army3', 'army4']);
    expect(next.board.terrain[0]![7]!.owner).toBeUndefined();
    expect(next.eliminations).toEqual([{ army: 'army2', round: 1 }]);
    expect(act(next, { type: 'endTurn' }).round.index).toBe(2);
  });
  it('keeps a captured home capital with its surviving capturer and removes the defeated troops', () => {
    const map = fixture();
    map.units[0]!.position = { x: 7, y: 0 };
    let s = value(createFourArmyState(map));
    s = value(applyFourArmyCommand(s, { actor: 'army1', type: 'capture', unitId: 'a0' }));
    expect(s.board.terrain[0]![7]!.capturePoints).toBe(10);
    s = cycle(s);
    s = value(applyFourArmyCommand(s, { actor: 'army1', type: 'capture', unitId: 'a0' }));
    expect(s.board.terrain[0]![7]!.owner).toBe('army1');
    expect(s.alive).toEqual(['army1', 'army3', 'army4']);
    expect(s.units.find((u) => u.id === 'a1')).toBeUndefined();
    expect(s.outcome.type).toBe('ongoing');
  });
  it('closes a current-army fuel death once and advances the fixed round boundary once', () => {
    const map = fixture();
    map.units[0] = { ...unit('aircraft', 'army1', { x: 1, y: 1 }, 'fighter'), fuel: 1 };
    let s = value(createFourArmyState(map));
    expect(s.units[0]!.fuel).toBe(1);
    s = cycle(s);
    expect(s.alive).toEqual(['army2', 'army3', 'army4']);
    expect(s.round.round).toBe(2);
    expect(s.round.index).toBe(1);
    expect(s.players.army2.gold).toBe(22000);
    expect(s.eliminations).toEqual([{ army: 'army1', round: 2 }]);
  });
  it('repairs and resupplies only from owned facilities and never counts a supply depot as income', () => {
    const map = fixture();
    map.board.terrain[1]![1] = { kind: 'city', owner: 'army1' };
    map.board.terrain[2]![1] = { kind: 'supplyDepot', owner: 'army1' };
    map.units[0]!.hp = 50;
    map.units[0]!.fuel = 1;
    const s = value(createFourArmyState(map));
    expect(s.units[0]!.hp).toBe(70);
    expect(s.units[0]!.fuel).toBe(99);
    expect(s.players.army1.gold).toBe(21800);
    const other = fixture();
    other.board.terrain[1]![1] = { kind: 'city', owner: 'army2' };
    other.units[0]!.hp = 50;
    other.units[0]!.fuel = 1;
    const enemySite = value(createFourArmyState(other));
    expect(enemySite.units[0]!.hp).toBe(50);
    expect(enemySite.units[0]!.fuel).toBe(1);
  });
  it('uses finite friendly APC stock without sharing supplies between enemy armies', () => {
    const map = fixture();
    map.units[0]!.fuel = 0;
    map.units.push({ ...unit('supply', 'army1', { x: 2, y: 1 }, 'apc'), supplyStock: 10 });
    const s = value(createFourArmyState(map));
    expect(s.units[0]!.fuel).toBe(10);
    expect(s.units.find((u) => u.id === 'supply')!.supplyStock).toBe(0);
    const other = fixture();
    other.units[0]!.fuel = 0;
    other.units.push(unit('enemySupply', 'army2', { x: 2, y: 1 }, 'apc'));
    expect(value(createFourArmyState(other)).units[0]!.fuel).toBe(0);
  });
  it('uses facility-v2 production and preserves all nonacting armies', () => {
    const map = fixture();
    map.board.terrain[2]![2] = { kind: 'factory', owner: 'army1' };
    const s = value(createFourArmyState(map));
    expect(applyFourArmyCommand(s, { actor: 'army1', type: 'produce', factory: { x: 2, y: 2 }, kind: 'fighter' }).ok).toBe(false);
    const next = value(applyFourArmyCommand(s, { actor: 'army1', type: 'produce', factory: { x: 2, y: 2 }, kind: 'infantry' }));
    expect(next.units.at(-1)).toMatchObject({ id: 'u1', owner: 'army1', hasActed: true });
    expect(next.players.army1.gold).toBe(21000);
    expect(next.players.army2).toEqual(s.players.army2);
  });
  it('automatically pauses at round 100 and resumes without duplicate income or upkeep', () => {
    const map = fixture();
    let s = value(createFourArmyState(map));
    s = cycle(s, 400);
    expect(s.round.round).toBe(101);
    expect(s.round.phase).toBe('pending');
    expect(s.paused).toBe(true);
    expect(s.players.army1.gold).toBe(120000);
    expect(applyFourArmyCommand(s, { actor: 'army1', type: 'endTurn' }).ok).toBe(false);
    const loaded = value(
      parseFourArmyArchive(
        value(
          serializeFourArmyArchive(
            map,
            Array.from({ length: 400 }, (_, i) => ({ actor: FOUR_ARMY_IDS[i % 4]!, type: 'endTurn' as const })),
            s,
          ),
        ),
      ),
    );
    const next = value(applyFourArmyCommand(loaded.payload.state, { actor: 'army1', type: 'resume' }));
    expect(next.players.army1.gold).toBe(121000);
    expect(next.round.phase).toBe('active');
    expect(next.paused).toBe(false);
    expect(applyFourArmyCommand(next, { actor: 'army1', type: 'resume' }).ok).toBe(false);
  });
  it('finishes at the last surviving army and rejects subsequent commands', () => {
    const map = fixture();
    map.units[0] = unit('tank', 'army1', { x: 3, y: 3 }, 'tank');
    map.units[1]!.position = { x: 4, y: 3 };
    map.units[1]!.hp = 1;
    const s = value(createFourArmyState(map));
    s.units = s.units.filter((u) => u.owner === 'army1' || u.owner === 'army2');
    s.alive = ['army1', 'army2'];
    s.eliminations = [
      { army: 'army3', round: 1 },
      { army: 'army4', round: 1 },
    ];
    delete s.board.terrain[7]![7]!.owner;
    delete s.board.terrain[7]![0]!.owner;
    expect(isFourArmyState(s)).toBe(true);
    const next = value(applyFourArmyCommand(s, { actor: 'army1', type: 'attack', unitId: 'tank', targetId: 'a1' }));
    expect(next.outcome).toEqual({ type: 'victory', winner: 'army1' });
    expect(next.round.round).toBe(1);
    expect(applyFourArmyCommand(next, { actor: 'army1', type: 'endTurn' }).ok).toBe(false);
  });
  it('merges only friendly units and retains production IDs without collisions', () => {
    const map = fixture();
    map.units[0]!.id = 'u1';
    map.units[0]!.hp = 50;
    map.units.push({ ...unit('friend', 'army1', { x: 2, y: 1 }), hp: 40 });
    map.units[1]!.position = { x: 1, y: 2 };
    const s = value(createFourArmyState(map));
    expect(s.nextUnitId).toBe(2);
    expect(applyFourArmyCommand(s, { actor: 'army1', type: 'merge', unitId: 'u1', targetId: 'a1' }).ok).toBe(false);
    const next = value(applyFourArmyCommand(s, { actor: 'army1', type: 'merge', unitId: 'u1', targetId: 'friend' }));
    expect(next.units.find((u) => u.id === 'u1')!.hp).toBe(90);
    expect(next.units.some((u) => u.id === 'friend')).toBe(false);
  });
  it('rejects malformed boards, unit/cargo ownership, dead armies and unsupported engine variants', () => {
    const s = value(createFourArmyState(fixture()));
    const cases: any[] = [
      null,
      {},
      { ...s, engineVersion: 2 },
      { ...s, units: [null, ...s.units] },
      { ...s, units: [...s.units, { ...s.units[0], id: 'bad', position: undefined, embarkedIn: 'a1' }] },
      { ...s, alive: ['army1', 'army1'] },
      { ...s, rngSeed: -1 },
      { ...s, board: { ...s.board, width: 33 } },
      { ...s, units: s.units.map((u) => ({ ...u, position: { x: 0, y: 0 } })) },
    ];
    for (const bad of cases) {
      expect(isFourArmyState(bad)).toBe(false);
      expect(applyFourArmyCommand(bad, { actor: 'army1', type: 'endTurn' }).ok).toBe(false);
    }
    expect(createFourArmyState({ ...fixture(), units: [null] }).ok).toBe(false);
  });
});

describe('four-army verified engine checkpoint', () => {
  it('rejects non-string command discriminants without coercing untrusted JSON objects', () => {
    const map = fixture();
    const s = value(createFourArmyState(map));
    const text = value(serializeFourArmyArchive(map, [], s));
    for (const type of [null, 1, true, [], { toString: 'endTurn' }, { toString: 0, valueOf: 0 }]) {
      const command = { actor: 'army1', type };
      expect(isFourArmyCommand(command)).toBe(false);
      expect(applyFourArmyCommand(s, command).ok).toBe(false);
      const archive = JSON.parse(text);
      archive.payload.commands = [command];
      expect(parseFourArmyArchive(JSON.stringify(archive)).ok).toBe(false);
    }
  });

  it('rejects a real engine checkpoint in every legacy reader', () => {
    const map = fixture();
    const s = value(createFourArmyState(map));
    const text = value(serializeFourArmyArchive(map, [], s));
    expect(parseSavedGame(text).ok).toBe(false);
    expect(parseReplay(text).ok).toBe(false);
    expect(parseResearch(text).ok).toBe(false);
    expect(previewSaveRecovery(text).ok).toBe(false);
  });
  it('replays combat RNG and resumes identically after JSON key reordering', () => {
    const map = fixture();
    map.units[0] = unit('tank', 'army1', { x: 3, y: 3 }, 'tank');
    map.units[1]!.position = { x: 4, y: 3 };
    const commands: FourArmyCommand[] = [
      { actor: 'army1', type: 'attack', unitId: 'tank', targetId: 'a1' },
      { actor: 'army1', type: 'endTurn' },
    ];
    let s = value(createFourArmyState(map));
    for (const c of commands) s = value(applyFourArmyCommand(s, c));
    const text = value(serializeFourArmyArchive(map, commands, s));
    const raw = JSON.parse(text);
    raw.payload.state.outcome = { type: raw.payload.state.outcome.type };
    const restored = value(parseFourArmyArchive(JSON.stringify(raw))).payload.state;
    expect(restored).toEqual(s);
    expect(act(restored, { type: 'endTurn' })).toEqual(act(s, { type: 'endTurn' }));
    expect(restored.players.army2.gold).toBe(21000);
  });
  it('rejects tampered checkpoints, unknown versions, foreign actors, excessive history and excessive bytes', () => {
    const map = fixture();
    const s = value(createFourArmyState(map));
    const text = value(serializeFourArmyArchive(map, [], s));
    for (const mutate of [
      (v: any) => (v.schemaVersion = 2),
      (v: any) => (v.ruleset = 'future'),
      (v: any) => v.payload.state.players.army1.gold++,
      (v: any) => v.payload.state.rngSeed++,
      (v: any) => v.payload.commands.push({ actor: 'army2', type: 'endTurn' }),
      (v: any) => (v.payload.commands = Array(2049).fill({ actor: 'army1', type: 'endTurn' })),
      (v: any) => (v.payload.map.extra = true),
    ]) {
      const raw = JSON.parse(text);
      mutate(raw);
      expect(parseFourArmyArchive(JSON.stringify(raw)).ok).toBe(false);
    }
    expect(parseFourArmyArchive(' '.repeat(1_000_001)).ok).toBe(false);
    expect(parseFourArmyArchive('{').ok).toBe(false);
    expect(serializeFourArmyArchive(map, [], { ...s, nextUnitId: 99 }).ok).toBe(false);
  });
});
