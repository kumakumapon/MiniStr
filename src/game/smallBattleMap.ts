import { FOUR_ARMY_IDS, type FourArmyId } from './fourArmyFoundation';
import { createFourArmyState, type FourArmyMap } from './fourArmyEngine';
import { isFourArmyRules, type FourArmyRules } from './fourArmyRules';
import { fourArmyRoster, type SmallBattle } from './smallBattle';
import type { GameResult, Position, UnitKind } from './types';
import { unitStats } from './units';
import { weaponsForUnit } from './weapons';

/** Frozen derivative of v1.5.20 Green Border. Future two-army edits cannot alter saved variants. */
export function createSmallBattleMap(
  count: 3 | 4 = 4,
  seed = 1521,
  order?: readonly FourArmyId[],
  ending: SmallBattle['ending'] = 'short',
  rules?: FourArmyRules,
): GameResult<FourArmyMap> {
  if ((count !== 3 && count !== 4) || !['short', 'unlimited'].includes(ending)) return { ok: false, error: '小型対局の設定が不正です。' };
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff || (order !== undefined && !Array.isArray(order)) || (rules !== undefined && !isFourArmyRules(rules)))
    return { ok: false, error: '小型対局の初期条件が不正です。' };
  const participants = FOUR_ARMY_IDS.slice(0, count),
    width = 18,
    height = 14;
  const board: FourArmyMap['board'] = { width, height, terrain: Array.from({ length: height }, () => Array.from({ length: width }, () => ({ kind: 'plain' }))) };
  const set = (x: number, y: number, kind: FourArmyMap['board']['terrain'][number][number]['kind'], owner?: FourArmyId) => {
    board.terrain[y]![x] = { kind, ...(owner ? { owner } : {}), ...(['capital', 'factory', 'city'].includes(kind) ? { capturePoints: 20 } : {}) };
  };
  // Preserve the border's roads/woodland motif, then balance all starting sectors.
  for (const [x, y] of [
    [4, 3],
    [5, 3],
    [4, 4],
    [5, 4],
    [12, 9],
    [13, 9],
    [12, 10],
    [13, 10],
  ])
    set(x!, y!, 'forest');
  for (const [x, y] of [
    [3, 10],
    [14, 3],
  ])
    set(x!, y!, 'mountain');
  for (const [x, y] of [
    [3, 2],
    [4, 2],
    [13, 11],
    [14, 11],
    [6, 4],
    [7, 4],
    [8, 4],
    [9, 9],
    [10, 9],
    [11, 9],
  ])
    set(x!, y!, 'road');
  const zones =
    count === 4
      ? [
          { x: 0, y: 0, width: 6, height: 5 },
          { x: 12, y: 0, width: 6, height: 5 },
          { x: 12, y: 9, width: 6, height: 5 },
          { x: 0, y: 9, width: 6, height: 5 },
        ]
      : [
          { x: 6, y: 0, width: 6, height: 5 },
          { x: 0, y: 6, width: 6, height: 5 },
          { x: 12, y: 6, width: 6, height: 5 },
        ];
  for (const z of zones) for (let y = z.y; y < z.y + z.height; y++) for (let x = z.x; x < z.x + z.width; x++) set(x, y, 'plain');
  const homes: Position[] =
    count === 4
      ? [
          { x: 2, y: 2 },
          { x: 15, y: 2 },
          { x: 15, y: 11 },
          { x: 2, y: 11 },
        ]
      : [
          { x: 8, y: 2 },
          { x: 2, y: 8 },
          { x: 14, y: 8 },
        ];
  const capitals = fourArmyRoster(participants, (_, i) => homes[i]!);
  const units: FourArmyMap['units'] = [];
  participants.forEach((army, i) => {
    const p = homes[i]!,
      top = p.y < 7,
      right = p.x > 9,
      dx = right ? -1 : 1,
      dy = top ? 1 : -1;
    set(p.x, p.y, 'capital', army);
    if (count === 3) {
      const forward = i === 0 ? { x: 0, y: 1 } : i === 1 ? { x: 1, y: 0 } : { x: -1, y: 0 };
      set(p.x - forward.x * 2, p.y - forward.y * 2, 'factory', army);
      set(p.x - forward.x, p.y - forward.y, 'city', army);
    } else {
      set(p.x + dx, p.y, 'factory', army);
      set(p.x, p.y + dy, 'city', army);
    }
    const starts: readonly [UnitKind, number, number][] = [
      ['infantry', 0, 2],
      ['infantry', 1, 1],
      ['recon', 2, 0],
      ['tank', 2, 1],
    ];
    starts.forEach(([kind, x, y]) => {
      const stats = unitStats[kind];
      units.push({
        id: `u${units.length + 1}`,
        owner: army,
        kind,
        position:
          count === 3
            ? (() => {
                const side = kind === 'infantry' ? (x === 0 ? -1 : 1) : 0,
                  front = kind === 'recon' ? 2 : 1;
                return i === 0 ? { x: p.x + side, y: p.y + front } : i === 1 ? { x: p.x + front, y: p.y - side } : { x: p.x - front, y: p.y + side };
              })()
            : { x: p.x + dx * x, y: p.y + dy * y },
        hp: 100,
        fuel: stats.fuel,
        ammo: stats.ammo,
        ...(weaponsForUnit(kind, { ruleVersion: 12 })[1] ? { secondaryAmmo: weaponsForUnit(kind, { ruleVersion: 12 })[1]!.ammo } : {}),
        hasMoved: false,
        hasActed: false,
      });
    });
  });
  const neutralFactories =
    count === 4
      ? [
          [8, 6],
          [9, 6],
          [8, 7],
          [9, 7],
        ]
      : [
          [9, 6],
          [6, 7],
          [10, 9],
        ];
  const neutralCities =
    count === 4
      ? [
          [6, 6],
          [11, 6],
          [6, 7],
          [11, 7],
        ]
      : [
          [7, 5],
          [5, 9],
          [11, 7],
        ];
  for (const [x, y] of neutralFactories) set(x!, y!, 'factory');
  for (const [x, y] of neutralCities) set(x!, y!, 'city');
  const match: SmallBattle = {
    version: 1,
    sourceMapId: 'skirmish',
    layoutVersion: 1,
    participants: [...participants],
    ending,
    ...(ending === 'short' ? { roundLimit: 20 as const } : {}),
  };
  const map: FourArmyMap = {
    id: `skirmish-ffa${count}-v1`,
    match,
    board,
    capitals,
    units,
    players: fourArmyRoster(participants, () => ({ gold: 6000, income: 0 })),
    order: [...(order ?? participants)],
    seed,
    pathVersion: 2,
    setup: { version: 1, unitLimitPerArmy: 8, startZones: fourArmyRoster(participants, (_, i) => zones[i]!) },
    ...(rules ? { rules } : {}),
  };
  const checked = createFourArmyState(map);
  return checked.ok ? { ok: true, value: map } : checked;
}
