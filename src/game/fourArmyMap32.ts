import { FOUR_ARMY_IDS, createFourArmyRound, type FourArmyId } from './fourArmyFoundation';
import type { FourArmyMap, FourArmyTerrain, FourArmyUnit } from './fourArmyEngine';
import type { FourArmySetup } from './fourArmySetup';
import type { GameResult, Position, UnitKind } from './types';
import { unitStats } from './units';
import { SUPPLY_CAPACITY } from './supplyStock';
import { weaponsForUnit } from './weapons';

export const FOUR_ARMY_MAP32_ID = 'four-fronts-32-v1';
/** Selected after the candidate-cap comparison recorded with this release. */
export const FOUR_ARMY_MAP32_UNIT_LIMIT = 16;
export function rotateFourArmy32(p: Position, turns: number): Position {
  let q = { ...p };
  for (let i = 0; i < turns; i++) q = { x: 31 - q.y, y: q.x };
  return q;
}

/** Fixed map snapshot, independent of the first actor and the combat RNG stream. */
export function createFourArmyMap32(seed = 1512, order: readonly FourArmyId[] = FOUR_ARMY_IDS, pathVersion?: 1): GameResult<FourArmyMap> {
  if (pathVersion !== undefined && pathVersion !== 1) return { ok: false, error: '未対応の経路規則です。' };
  const round = createFourArmyRound(order);
  if (!round.ok) return round;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) return { ok: false, error: '4軍マップのseedが不正です。' };
  const board: FourArmyMap['board'] = { width: 32, height: 32, terrain: Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => ({ kind: 'plain' }))) };
  const capitals = {} as FourArmyMap['capitals'];
  const startZones = {} as FourArmySetup['startZones'];
  const units: FourArmyUnit[] = [];
  const roster: { kind: UnitKind; position: Position }[] = [
    { kind: 'infantry', position: { x: 4, y: 4 } },
    { kind: 'infantry', position: { x: 5, y: 4 } },
    { kind: 'infantry', position: { x: 4, y: 5 } },
    { kind: 'recon', position: { x: 6, y: 4 } },
    { kind: 'tank', position: { x: 5, y: 5 } },
    { kind: 'artillery', position: { x: 6, y: 5 } },
    { kind: 'apc', position: { x: 4, y: 6 } },
    { kind: 'antiAir', position: { x: 5, y: 6 } },
  ];
  FOUR_ARMY_IDS.forEach((army, rotation) => {
    const put = (p: Position, t: FourArmyTerrain) => {
      const q = rotateFourArmy32(p, rotation);
      board.terrain[q.y]![q.x] = { ...t };
    };
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const kind = x === 5 || y === 5 || x >= 14 || y >= 14 ? 'road' : x >= 9 && x <= 11 && y >= 7 && y <= 9 ? 'forest' : x === 8 && y >= 8 && y <= 10 ? 'mountain' : 'plain';
        put({ x, y }, { kind });
      }
    capitals[army] = rotateFourArmy32({ x: 3, y: 3 }, rotation);
    const corners = [rotateFourArmy32({ x: 1, y: 1 }, rotation), rotateFourArmy32({ x: 9, y: 9 }, rotation)];
    startZones[army] = { x: Math.min(...corners.map((p) => p.x)), y: Math.min(...corners.map((p) => p.y)), width: 9, height: 9 };
    for (const [kind, x, y] of [
      ['capital', 3, 3],
      ['factory', 5, 3],
      ['airport', 3, 5],
      ['city', 3, 7],
      ['city', 7, 3],
    ] as const)
      put({ x, y }, { kind, owner: army, capturePoints: 20 });
    put({ x: 12, y: 10 }, { kind: 'factory', capturePoints: 20 });
    put({ x: 10, y: 12 }, { kind: 'city', capturePoints: 20 });
    roster.forEach(({ kind, position }, i) =>
      units.push({
        id: `u${rotation * roster.length + i + 1}`,
        owner: army,
        kind,
        position: rotateFourArmy32(position, rotation),
        hp: 100,
        fuel: unitStats[kind].fuel,
        ammo: unitStats[kind].ammo,
        ...(weaponsForUnit(kind, { ruleVersion: 12 })[1] ? { secondaryAmmo: weaponsForUnit(kind, { ruleVersion: 12 })[1]!.ammo } : {}),
        ...(kind === 'apc' ? { supplyStock: SUPPLY_CAPACITY } : {}),
        hasMoved: false,
        hasActed: false,
      }),
    );
  });
  return {
    ok: true,
    value: {
      id: FOUR_ARMY_MAP32_ID,
      ...(pathVersion === 1 ? { pathVersion } : {}),
      board,
      capitals,
      units,
      players: Object.fromEntries(FOUR_ARMY_IDS.map((a) => [a, { gold: 10000, income: 0 }])) as FourArmyMap['players'],
      order: [...round.value.order],
      seed,
      setup: { version: 1, unitLimitPerArmy: FOUR_ARMY_MAP32_UNIT_LIMIT, startZones },
    },
  };
}
