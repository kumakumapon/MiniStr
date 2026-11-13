import { describe, it, expect } from 'vitest';
import { packFourArmyCommands, unpackFourArmyCommands, FOUR_ARMY_LONG_COMMANDS } from './fourArmyCommandLog';
import type { FourArmyCommand } from './fourArmyEngine';
const actor = 'army3' as const;
const commands: FourArmyCommand[] = [
  { actor, type: 'endTurn' },
  { actor, type: 'resume' },
  { actor, type: 'wait', unitId: 'u1' },
  { actor, type: 'move', unitId: 'u1', destination: { x: 31, y: 0 } },
  { actor, type: 'attack', unitId: 'u1', targetId: 'u2' },
  { actor, type: 'attack', unitId: 'u1', targetId: 'u2', weaponSlot: 0 },
  { actor, type: 'attack', unitId: 'u1', targetId: 'u2', weaponSlot: 1 },
  { actor, type: 'capture', unitId: 'u1' },
  { actor, type: 'produce', factory: { x: 3, y: 4 }, kind: 'infantry' },
  { actor, type: 'merge', unitId: 'u1', targetId: 'u2' },
  { actor, type: 'embark', unitId: 'u1', transportId: 'u3' },
  { actor, type: 'disembark', transportId: 'u3', destination: { x: 0, y: 31 } },
];
describe('lossless four-army command log', () => {
  it('round trips all ten commands and optional weapon selection without changing commands', () => {
    const copy = structuredClone(commands),
      packed = packFourArmyCommands(commands);
    expect(packed.ids).toEqual(['u1', 'u2', 'u3']);
    expect(unpackFourArmyCommands(packed)).toEqual({ ok: true, value: commands });
    expect(commands).toEqual(copy);
    expect(unpackFourArmyCommands(packFourArmyCommands([]))).toEqual({ ok: true, value: [] });
  });
  it('rejects unknown encodings, bad dictionaries, unused identities and oversized logs', () => {
    for (const bad of [
      null,
      [],
      {},
      { ...packFourArmyCommands(commands), extra: 1 },
      { encoding: 'unknown', ids: [], rows: [] },
      { encoding: 'four-army-log-v1', ids: ['u1', 'u1'], rows: [] },
      { encoding: 'four-army-log-v1', ids: ['<id>'], rows: [] },
      { encoding: 'four-army-log-v1', ids: ['u1'], rows: [] },
      { encoding: 'four-army-log-v1', ids: [], rows: Array.from({ length: FOUR_ARMY_LONG_COMMANDS + 1 }, () => [0, 0]) },
    ])
      expect(unpackFourArmyCommands(bad).ok).toBe(false);
  });
  it('rejects truncated/extra tuple fields and invalid references, actors, coordinates and unit kinds', () => {
    const source = packFourArmyCommands(commands);
    for (const r of source.rows) {
      for (const row of [r.slice(0, -1), [...r, 'extra']]) {
        if (r[0] === 4 && r.length === 5 && row.length === 4) continue;
        expect(unpackFourArmyCommands({ ...source, rows: [row] }).ok).toBe(false);
      }
    }
    for (const row of [
      null,
      [],
      [99, 0],
      [0, 4],
      [0, -1],
      [0, 1.5],
      [2, 0, -1],
      [2, 0, 0.5],
      [2, 0, 99],
      [3, 0, 0, 32, 0],
      [3, 0, 0, 1, '2'],
      [4, 0, 0, 1, 'unknown'],
      [6, 0, 0, 0, 'future'],
    ])
      expect(unpackFourArmyCommands({ ...source, rows: [row] }).ok).toBe(false);
  });
});
