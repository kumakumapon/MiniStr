import { FOUR_ARMY_IDS } from '../game/fourArmyFoundation';
import type { FourArmyMap, FourArmyUnit } from '../game/fourArmyEngine';
import type { Position, UnitKind } from '../game/types';
import { unitStats } from '../game/units';

export function fourCpuUnit(id: string, owner: FourArmyUnit['owner'], position: Position, kind: UnitKind = 'infantry'): FourArmyUnit {
  return { id, owner, position, kind, hp: 100, fuel: unitStats[kind].fuel, ammo: unitStats[kind].ammo, hasMoved: false, hasActed: false };
}
export function fourCpuMap(): FourArmyMap {
  const corners = [
    { x: 0, y: 0 },
    { x: 7, y: 0 },
    { x: 7, y: 7 },
    { x: 0, y: 7 },
  ];
  const board: FourArmyMap['board'] = { width: 8, height: 8, terrain: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({ kind: 'plain' }))) };
  const capitals = Object.fromEntries(FOUR_ARMY_IDS.map((a, i) => [a, corners[i]!])) as FourArmyMap['capitals'];
  FOUR_ARMY_IDS.forEach((a) => {
    const p = capitals[a];
    board.terrain[p.y]![p.x] = { kind: 'capital', owner: a, capturePoints: 20 };
  });
  return {
    id: 'four-cpu-test',
    board,
    capitals,
    units: FOUR_ARMY_IDS.map((a, i) => fourCpuUnit(`u${i + 1}`, a, { x: i === 0 || i === 3 ? 1 : 6, y: i < 2 ? 1 : 6 })),
    players: Object.fromEntries(FOUR_ARMY_IDS.map((a) => [a, { gold: 0, income: 0 }])) as FourArmyMap['players'],
    order: [...FOUR_ARMY_IDS],
    seed: 42,
  };
}
