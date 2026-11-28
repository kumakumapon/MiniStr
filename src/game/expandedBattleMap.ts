import { authoredArrival } from './fourArmyArrival';
import { authoredBattlefield, isAuthoredFourSource } from './asymmetricFourSites';
import { createAsymmetricLayout, isAsymmetricSource, siteTeam } from './asymmetricBattlefield';
import { FOUR_ARMY_IDS, type FourArmyId } from './fourArmyFoundation';
import { createFourArmyState, type FourArmyMap, type FourArmyTerrain } from './fourArmyEngine';
import { isFourArmyRules, type FourArmyRules } from './fourArmyRules';
import { fourArmyRoster, isSmallBattle, type ExpandedBattle } from './smallBattle';
import type { GameResult, Position, UnitKind } from './types';
import { unitStats } from './units';
import { weaponsForUnit } from './weapons';
import { SUPPLY_CAPACITY } from './supplyStock';

export interface ExpandedBattleOptions {
  sourceMapId?: ExpandedBattle['sourceMapId'];
  layoutVersion?: ExpandedBattle['layoutVersion'];
  siteArmies?: readonly FourArmyId[];
  participants?: readonly FourArmyId[];
  order?: readonly FourArmyId[];
  seed?: number;
  ending?: ExpandedBattle['ending'];
  teams?: Partial<Record<FourArmyId, FourArmyId>>;
  sharedVision?: boolean;
  rules?: FourArmyRules;
}
export function expandedBattleDimensions(source: ExpandedBattle['sourceMapId']) {
  return source === 'frontier' ? { width: 32, height: 32 } : source === 'strait' ? { width: 17, height: 15 } : { width: 18, height: 14 };
}
/** Layout 3 protects the northern neutral facilities from simultaneous flank pressure; callers loading historical snapshots keep layout 2. */
export const latestExpandedBattleLayout = (source: ExpandedBattle['sourceMapId'], count: number): ExpandedBattle['layoutVersion'] =>
  isAuthoredFourSource(source)
    ? authoredBattlefield(source).arrival
      ? 10
      : authoredBattlefield(source).objective
        ? 9
        : 8
    : source === 'encirclement'
      ? 7
      : source === 'crown'
        ? 6
        : isAsymmetricSource(source)
          ? 5
          : count === 3 && (source === 'skirmish' || source === 'outpost')
            ? 3
            : 2;
/** Authored snapshots. No legacy preset is edited or used as a mutable source. */
export function createExpandedBattleMap(options: ExpandedBattleOptions = {}): GameResult<FourArmyMap> {
  if (
    !options ||
    typeof options !== 'object' ||
    (options.participants !== undefined && !Array.isArray(options.participants)) ||
    (options.order !== undefined && !Array.isArray(options.order)) ||
    (options.siteArmies !== undefined && (!isAsymmetricSource(options.sourceMapId) || !Array.isArray(options.siteArmies)))
  )
    return { ok: false, error: '参加軍・チーム・初期条件が不正です。' };
  const participants: FourArmyId[] = [...(options.participants ?? FOUR_ARMY_IDS)],
    sourceMapId = options.sourceMapId ?? 'skirmish',
    seed = options.seed ?? 1522,
    objective = isAuthoredFourSource(sourceMapId) ? authoredBattlefield(sourceMapId).objective : undefined,
    ending = options.ending ?? (sourceMapId === 'frontier' || objective ? 'unlimited' : 'short');
  const sites = options.siteArmies ?? participants;
  const arrival = authoredArrival(sourceMapId, sites);
  const team = (a: FourArmyId) => options.teams?.[a] ?? siteTeam(sourceMapId, sites, a);
  const match: ExpandedBattle = {
    version: arrival ? 3 : 2,
    ...(arrival ? { arrival } : {}),
    sourceMapId,
    layoutVersion: options.layoutVersion ?? (isAsymmetricSource(sourceMapId) ? latestExpandedBattleLayout(sourceMapId, participants.length) : 2),
    ...(isAsymmetricSource(sourceMapId) ? { siteArmies: [...sites] } : {}),
    participants,
    ...(objective ? { objective: structuredClone(objective) } : {}),
    initialOrder: [...(options.order ?? participants)],
    initiative: participants.length === 2 ? 'fixed' : 'rotating',
    ending,
    ...(ending === 'short' ? { roundLimit: sourceMapId === 'tundra' ? (15 as const) : participants.length === 3 ? (21 as const) : (20 as const) } : {}),
    teams: fourArmyRoster(participants, team),
    sharedVision: options.sharedVision ?? new Set(participants.map(team)).size < participants.length,
  };
  if (!isSmallBattle(match) || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff || (options.rules !== undefined && !isFourArmyRules(options.rules)))
    return { ok: false, error: '参加軍・チーム・初期条件が不正です。' };
  if (isAsymmetricSource(sourceMapId)) {
    const map = createAsymmetricLayout(sourceMapId, match, seed, options.rules);
    const checked = createFourArmyState(map);
    return checked.ok ? { ok: true, value: map } : checked;
  }
  const { width, height } = expandedBattleDimensions(sourceMapId),
    wide = sourceMapId === 'frontier',
    sea = sourceMapId === 'strait',
    triangular = participants.length === 3;
  const board: FourArmyMap['board'] = {
    width,
    height,
    terrain: Array.from({ length: height }, () => Array.from({ length: width }, () => ({ kind: sea && triangular ? 'sea' : 'plain' }))),
  };
  const put = (p: Position, kind: FourArmyTerrain['kind'], owner?: FourArmyId) => {
    if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) throw Error('Preset outside board');
    board.terrain[p.y]![p.x] = { kind, ...(owner ? { owner } : {}), ...(['capital', 'factory', 'city', 'airport', 'port'].includes(kind) ? { capturePoints: 20 } : {}) };
  };
  const allHomes: Position[] = triangular
    ? wide
      ? [
          { x: 16, y: 4 },
          { x: 4, y: 16 },
          { x: 28, y: 16 },
        ]
      : [
          { x: 8, y: sea ? 2 : 1 },
          { x: 2, y: 8 },
          { x: 14, y: 8 },
        ]
    : [
        { x: wide ? 3 : 2, y: wide ? 3 : 2 },
        { x: width - (wide ? 4 : 3), y: wide ? 3 : 2 },
        { x: width - (wide ? 4 : 3), y: height - (wide ? 4 : 3) },
        { x: wide ? 3 : 2, y: height - (wide ? 4 : 3) },
      ];
  const slots = participants.length === 2 ? [0, 2] : participants.map((_, i) => i),
    homes = slots.map((i) => allHomes[i]!);
  const local = (i: number, side: number, front: number): Position => {
    const p = homes[i]!;
    if (triangular) return i === 0 ? { x: p.x + side, y: p.y + front } : i === 1 ? { x: p.x + front, y: p.y - side } : { x: p.x - front, y: p.y + side };
    return { x: p.x + (p.x < width / 2 ? 1 : -1) * side, y: p.y + (p.y < height / 2 ? 1 : -1) * front };
  };
  const units: FourArmyMap['units'] = [],
    zones = {} as Record<FourArmyId, { x: number; y: number; width: number; height: number }>;
  const bridges: NonNullable<FourArmyMap['bridges']> = [];
  if (sea && !triangular) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (x === 8 || y === 7) put({ x, y }, 'sea');
  participants.forEach((army, i) => {
    const home = homes[i]!,
      margin = wide ? 4 : 2;
    zones[army] = {
      x: Math.max(0, home.x - margin),
      y: Math.max(0, home.y - margin),
      width: Math.min(width, home.x + margin + 1) - Math.max(0, home.x - margin),
      height: Math.min(height, home.y + (wide ? margin : 3) + 1) - Math.max(0, home.y - margin),
    };
    if (sea && triangular) {
      for (let f = -2; f <= 2; f++) for (let side = -2; side <= 2; side++) put(local(i, side, f), 'plain');
      zones[army] = i === 0 ? { x: 6, y: 0, width: 5, height: 6 } : i === 1 ? { x: 0, y: 6, width: 6, height: 5 } : { x: 11, y: 6, width: 6, height: 5 };
    }
    put(home, 'capital', army);
    put(local(i, triangular && (sea || wide || i !== 0) ? 0 : 1, triangular && (sea || wide || i !== 0) ? -2 : 0), 'factory', army);
    put(local(i, 0, triangular ? -1 : 1), 'city', army);
    if (wide) {
      put(local(i, -2, 0), 'airport', army);
      put(local(i, 2, 0), 'city', army);
    }
    if (sea) {
      const port = triangular ? local(i, 0, 2) : { x: home.x < 8 ? 5 : 11, y: home.y < 7 ? 6 : 8 };
      put(port, 'port', army);
      const ship = triangular ? local(i, 0, 3) : { x: port.x, y: 7 };
      // Distinct naval starts on the same connected sea network.
      const shipPosition = triangular ? ship : { x: port.x + (home.y < 7 ? -1 : 1), y: 7 };
      put(shipPosition, 'sea');
      const carrierId = `u${units.length + 2}`;
      for (const [kind, position, embarkedIn] of [
        ['infantry', triangular ? local(i, 0, 1) : local(i, 0, 2), undefined],
        ['landingShip', port, undefined],
        ['infantry', undefined, carrierId],
        [triangular ? 'destroyer' : 'engineer', triangular ? shipPosition : { x: port.x, y: port.y + (home.y < 7 ? -1 : 1) }, undefined],
      ] as const) {
        const st = unitStats[kind];
        units.push({
          id: `u${units.length + 1}`,
          owner: army,
          kind,
          ...(position ? { position } : {}),
          ...(embarkedIn ? { embarkedIn } : {}),
          hp: 100,
          fuel: st.fuel,
          ammo: st.ammo,
          ...(weaponsForUnit(kind, { ruleVersion: 12 })[1] ? { secondaryAmmo: weaponsForUnit(kind, { ruleVersion: 12 })[1]!.ammo } : {}),
          hasMoved: false,
          hasActed: false,
        });
      }
      // A naval start may extend beyond the land rectangle; cargo shares its carrier's zone.
      const positions = units.filter((u) => u.owner === army && u.position).map((u) => u.position!);
      zones[army] = {
        x: Math.min(home.x, ...positions.map((p) => p.x)),
        y: Math.min(home.y, ...positions.map((p) => p.y)),
        width: Math.max(home.x, ...positions.map((p) => p.x)) - Math.min(home.x, ...positions.map((p) => p.x)) + 1,
        height: Math.max(home.y, ...positions.map((p) => p.y)) - Math.min(home.y, ...positions.map((p) => p.y)) + 1,
      };
    } else {
      const starts: [UnitKind, number, number][] = triangular
        ? [
            ['infantry', -1, 1],
            ['infantry', 1, 1],
            ['recon', 0, 2],
            ['tank', 0, 1],
          ]
        : [
            ['infantry', 0, 2],
            ['infantry', 1, 1],
            ['recon', 2, 0],
            ['tank', 2, 1],
          ];
      if (wide) starts.push(['artillery', -1, 2], ['apc', 1, 2], ['antiAir', -2, 1], ['infantry', 2, 2]);
      for (const [kind, s, f] of starts) {
        const st = unitStats[kind];
        units.push({
          id: `u${units.length + 1}`,
          owner: army,
          kind,
          position: local(i, s, f),
          hp: 100,
          fuel: st.fuel,
          ammo: st.ammo,
          ...(weaponsForUnit(kind, { ruleVersion: 12 })[1] ? { secondaryAmmo: weaponsForUnit(kind, { ruleVersion: 12 })[1]!.ammo } : {}),
          ...(kind === 'apc' ? { supplyStock: SUPPLY_CAPACITY } : {}),
          hasMoved: false,
          hasActed: false,
        });
      }
    }
  });
  if (sea && triangular) {
    for (let y = 6; y <= 10; y++) for (let x = 6; x <= 10; x++) put({ x, y }, 'plain');
    for (const p of [
      { x: 8, y: 6 },
      { x: 6, y: 8 },
      { x: 10, y: 8 },
    ])
      put(p, 'city');
    put({ x: 8, y: 8 }, 'factory');
    [
      { x: 7, y: 5 },
      { x: 5, y: 7 },
      { x: 11, y: 9 },
    ].forEach((position, i) => bridges.push({ owner: participants[i]!, position }));
  } else if (sea) {
    const crossings = [
      { x: 8, y: 3 },
      { x: 13, y: 7 },
      { x: 8, y: 11 },
      { x: 3, y: 7 },
    ];
    crossings.forEach((position, i) => bridges.push({ owner: participants[i % participants.length]!, position }));
    for (const p of [
      { x: 6, y: 5 },
      { x: 10, y: 5 },
      { x: 10, y: 9 },
      { x: 6, y: 9 },
    ])
      put(p, 'city');
  } else {
    participants.forEach((_army, i) => {
      const distance = wide ? 7 : triangular && match.layoutVersion === 3 && i === 0 ? 3 : 4;
      if (triangular) {
        put(local(i, 0, distance), 'factory');
        put(local(i, -1, distance - 1), 'city');
        put(local(i, 1, distance - 1), 'city');
        for (let f = 3; f < distance; f++) {
          const p = local(i, 0, f);
          if (!board.terrain[p.y]![p.x]!.owner) put(p, 'road');
        }
        for (const side of [-2, 2]) put(local(i, side, 1), 'forest');
      } else {
        put(local(i, 3, 2), 'factory');
        put(local(i, 3, 0), 'city');
        put(local(i, 0, 3), 'city');
        for (const p of [local(i, 4, 1), local(i, 4, 2)]) put(p, 'forest');
      }
      if (sourceMapId === 'outpost') {
        for (const p of [local(i, -1, 3), local(i, 1, 3)]) if (!board.terrain[p.y]![p.x]!.owner) put(p, 'forest');
      }
    });
    if (sourceMapId === 'outpost')
      for (const p of triangular
        ? [
            { x: 8, y: 7 },
            { x: 7, y: 8 },
            { x: 9, y: 8 },
          ]
        : [
            { x: 8, y: 6 },
            { x: 9, y: 6 },
            { x: 8, y: 7 },
            { x: 9, y: 7 },
          ])
        put(p, 'city');
  }
  const map: FourArmyMap = {
    id: `${sourceMapId}-multi-${participants.join('-')}-v${match.layoutVersion}`,
    match,
    board,
    capitals: fourArmyRoster(participants, (_, i) => homes[i]!),
    units,
    players: fourArmyRoster(participants, () => ({ gold: wide ? 10000 : 6000, income: 0 })),
    order: [...match.initialOrder],
    seed,
    pathVersion: 3,
    bridges,
    setup: { version: 1, unitLimitPerArmy: wide ? 16 : 8, startZones: zones },
    ...(options.rules ? { rules: structuredClone(options.rules) } : {}),
  };
  const checked = createFourArmyState(map);
  return checked.ok ? { ok: true, value: map } : checked;
}
