import { FOUR_ARMY_IDS } from './fourArmyFoundation';
import { isFourArmyCommand, type FourArmyCommand } from './fourArmyEngine';
import type { GameResult } from './types';

export const FOUR_ARMY_LONG_COMMANDS = 65536;
export interface FourArmyCommandLog {
  encoding: 'four-army-log-v1';
  ids: string[];
  rows: (string | number)[][];
}
/** A lossless dictionary/tuple encoding. Combat randomness remains in the verified initial state. */
export function packFourArmyCommands(commands: readonly FourArmyCommand[]): FourArmyCommandLog {
  const ids: string[] = [],
    dictionary = new Map<string, number>();
  const id = (v: string) => {
    let n = dictionary.get(v);
    if (n === undefined) {
      n = ids.length;
      ids.push(v);
      dictionary.set(v, n);
    }
    return n;
  };
  const rows = commands.map((c) => {
    const a = FOUR_ARMY_IDS.indexOf(c.actor);
    switch (c.type) {
      case 'endTurn':
        return [0, a];
      case 'resume':
        return [1, a];
      case 'wait':
        return [2, a, id(c.unitId)];
      case 'move':
        return [3, a, id(c.unitId), c.destination.x, c.destination.y];
      case 'attack':
        return [4, a, id(c.unitId), id(c.targetId), ...(c.weaponSlot === undefined ? [] : [c.weaponSlot])];
      case 'capture':
        return [5, a, id(c.unitId)];
      case 'produce':
        return [6, a, c.factory.x, c.factory.y, c.kind];
      case 'merge':
        return [7, a, id(c.unitId), id(c.targetId)];
      case 'embark':
        return [8, a, id(c.unitId), id(c.transportId)];
      case 'disembark':
        return [9, a, id(c.transportId), c.destination.x, c.destination.y];
    }
  });
  return { encoding: 'four-army-log-v1', ids, rows };
}
export function unpackFourArmyCommands(input: unknown): GameResult<FourArmyCommand[]> {
  const fail = (): GameResult<never> => ({ ok: false, error: '4軍の圧縮命令列が不正です。' });
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join() !== 'encoding,ids,rows') return fail();
  const v = input as Record<string, unknown>;
  if (
    v.encoding !== 'four-army-log-v1' ||
    !Array.isArray(v.ids) ||
    v.ids.length > FOUR_ARMY_LONG_COMMANDS * 2 ||
    !v.ids.every((s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(s)) ||
    new Set(v.ids).size !== v.ids.length ||
    !Array.isArray(v.rows) ||
    v.rows.length > FOUR_ARMY_LONG_COMMANDS
  )
    return fail();
  const ids = v.ids as string[],
    used = new Set<number>();
  const id = (n: unknown) => {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n >= ids.length) return undefined;
    used.add(n);
    return ids[n];
  };
  const commands: FourArmyCommand[] = [];
  for (const row of v.rows) {
    if (!Array.isArray(row) || !Number.isInteger(row[1]) || row[1] < 0 || row[1] > 3) return fail();
    const actor = FOUR_ARMY_IDS[row[1]];
    let command: unknown;
    switch (row[0]) {
      case 0:
        if (row.length !== 2) return fail();
        command = { type: 'endTurn', actor };
        break;
      case 1:
        if (row.length !== 2) return fail();
        command = { type: 'resume', actor };
        break;
      case 2:
        if (row.length !== 3) return fail();
        command = { type: 'wait', actor, unitId: id(row[2]) };
        break;
      case 3:
        if (row.length !== 5) return fail();
        command = { type: 'move', actor, unitId: id(row[2]), destination: { x: row[3], y: row[4] } };
        break;
      case 4:
        if (row.length !== 4 && row.length !== 5) return fail();
        command = { type: 'attack', actor, unitId: id(row[2]), targetId: id(row[3]), ...(row.length === 5 ? { weaponSlot: row[4] } : {}) };
        break;
      case 5:
        if (row.length !== 3) return fail();
        command = { type: 'capture', actor, unitId: id(row[2]) };
        break;
      case 6:
        if (row.length !== 5) return fail();
        command = { type: 'produce', actor, factory: { x: row[2], y: row[3] }, kind: row[4] };
        break;
      case 7:
        if (row.length !== 4) return fail();
        command = { type: 'merge', actor, unitId: id(row[2]), targetId: id(row[3]) };
        break;
      case 8:
        if (row.length !== 4) return fail();
        command = { type: 'embark', actor, unitId: id(row[2]), transportId: id(row[3]) };
        break;
      case 9:
        if (row.length !== 5) return fail();
        command = { type: 'disembark', actor, transportId: id(row[2]), destination: { x: row[3], y: row[4] } };
        break;
      default:
        return fail();
    }
    if (!isFourArmyCommand(command)) return fail();
    commands.push(command);
  }
  return used.size === ids.length ? { ok: true, value: commands } : fail();
}
