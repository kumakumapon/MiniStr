import type { FourArmyMap, FourArmyTerrain } from './fourArmyEngine';
import type { FourArmyId } from './fourArmyFoundation';
import type { ExpandedBattle } from './smallBattle';
import type { FourArmyRules } from './fourArmyRules';
import type { Position, UnitKind } from './types';
import { unitStats } from './units';
import { weaponsForUnit } from './weapons';

export type AsymmetricSource = 'canyon' | 'marsh' | 'river' | 'tundra';
export function isAsymmetricSource(source: unknown): source is AsymmetricSource {
  return source === 'canyon' || source === 'marsh' || source === 'river' || source === 'tundra';
}

// A–D are permanent site identities within this layout. A row is west to east.
// # mountain, ~ swamp, = road, + forest, f neutral factory, c neutral city, w water, b bridged water.
// Version 4 is regenerated exactly when a recorded match is opened.
const historicalLayouts = {
  canyon: {
    3: [
      '..................',
      '..................',
      '......c.A.........',
      '.....#f...c.......',
      '...++......#......',
      '.....=####=##.....',
      '.....=..=.=.#.....',
      '..==.c=======.==..',
      '......#....c......',
      '...B..f##.........',
      '.........#f..C....',
      '.....c....#.......',
      '.....+.....c......',
      '..................',
    ],
    4: [
      '..................',
      '..................',
      '....#..A...++.....',
      '....##............',
      '.....c...c#..c....',
      '..==c==f====#.....',
      '..........=.f..C..',
      '..B..f##..=.......',
      '.......#..f..c....',
      '....c===c...c.+...',
      '......+.....#.....',
      '.....+....D..#....',
      '..................',
      '..................',
    ],
  },
  marsh: {
    3: [
      '..................',
      '..................',
      '.......c.A........',
      '.....~~f...c......',
      '...++.~...........',
      '.....~=~~~~=~.....',
      '...c.~~.=...~.....',
      '.....===========..',
      '..B..f~...~c......',
      '.......~~..~~.....',
      '....c~...~..f..C..',
      '..........~.+.....',
      '.....+.......c....',
      '..................',
    ],
    4: [
      '..................',
      '..................',
      '....~...A..++.....',
      '....~~............',
      '....c~c...c.......',
      '.....===f===~c=...',
      '..B..f...~=.~.....',
      '......~~.~=.f..C..',
      '....c..~f.=.~.....',
      '....=~c...c~=c+...',
      '......+...=.~.....',
      '.....+..D.=..~....',
      '..................',
      '..................',
    ],
  },
} as const;

const layouts = {
  canyon: {
    3: [
      '..................',
      '..................',
      '........A.........',
      '..##..........#...',
      '....##c.f..#.#....',
      '......#.=.#.......',
      '........=.........',
      '..+.====.====.....',
      '........=.........',
      '...B.f..=..f.C....',
      '..................',
      '...#c.+......c....',
      '..................',
      '..................',
    ],
    4: [
      '..................',
      '..................',
      '..................',
      '..#.....A.........',
      '...##...=...##....',
      '.....#..=..#......',
      '......c.=.........',
      '..+.B===f===C.....',
      '........=.c...+...',
      '........=..#......',
      '...#.#..=...#.....',
      '......+.D.........',
      '..................',
      '..................',
    ],
  },
  marsh: {
    3: [
      '..................',
      '..................',
      '........A.........',
      '..~~...f.c....~...',
      '....~~.....~.~....',
      '......~.=.~.......',
      '........=.........',
      '....c.==.====.....',
      '...B....=.....+...',
      '.....f..=.f.C.....',
      '...........c......',
      '...~..+......~....',
      '..................',
      '..................',
    ],
    4: [
      '..................',
      '..................',
      '..................',
      '..~.....A.........',
      '...~~...=...~~....',
      '.....~..=..~......',
      '......c.=.........',
      '..+.B===f===C.....',
      '........=.c...+...',
      '........=..~......',
      '...~.~..=...~.....',
      '......+.D.........',
      '..................',
      '..................',
    ],
  },
  river: {
    3: [
      '..................',
      '..................',
      '........A.........',
      '..................',
      '...=.c...=+...=...',
      '...=.+...=f.c.=...',
      'wwwbwwwwwbwwwwbwww',
      '...=...f.=..+.=...',
      '...=.c.+.=....=...',
      '...B.......c..C...',
      '..................',
      '..................',
      '..................',
      '..................',
    ],
    4: [
      '..................',
      '..................',
      '.....A............',
      '..............C...',
      '...=.c...=+...=...',
      '...=.+...=f.c.=...',
      'wwwbwwwwwbwwwwbwww',
      '...=...f.=..+.=...',
      '...=.c.+.=....=...',
      '...B.......c......',
      '..................',
      '............D.....',
      '..................',
      '..................',
    ],
  },
  tundra: {
    3: [
      '..................',
      '..................',
      '........A.........',
      '..................',
      '......c.=.c.......',
      '...##...f...##....',
      '.....##.=.##......',
      '..+.+...=...+..+..',
      '....=========.....',
      '.....c..=...c.....',
      '...B..........C...',
      '..................',
      '..................',
      '..................',
    ],
  },
} as const;

const ground: Record<string, FourArmyTerrain['kind']> = { w: 'sea', b: 'sea', '.': 'plain', '#': 'mountain', '~': 'swamp', '=': 'road', '+': 'forest', f: 'factory', c: 'city' };
const forward = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
] as const;
export function asymmetricBoard(source: AsymmetricSource, siteArmies: readonly FourArmyId[], layoutVersion = 5) {
  const count = siteArmies.length === 3 ? 3 : 4;
  const rows = source === 'tundra' ? layouts.tundra[3] : layoutVersion === 4 && source !== 'river' ? historicalLayouts[source][count] : layouts[source][count];
  const bridges: NonNullable<FourArmyMap['bridges']> = [];
  const homes = {} as FourArmyMap['capitals'];
  const terrain = rows.map((row, y) =>
    Array.from(row, (tile, x): FourArmyTerrain => {
      const site = 'ABCD'.indexOf(tile);
      if (site >= 0) {
        const owner = siteArmies[site]!;
        homes[owner] = { x, y };
        return { kind: 'capital', owner, capturePoints: 20 };
      }
      if (tile === 'b') bridges.push({ owner: siteArmies[bridges.length % siteArmies.length]!, position: { x, y } });
      const kind = ground[tile]!;
      return kind === 'city' || kind === 'factory' ? { kind, capturePoints: 20 } : { kind };
    }),
  );
  siteArmies.forEach((army, site) => {
    const h = homes[army],
      d = forward[site]!;
    terrain[h.y + d.x]![h.x - d.y] = { kind: 'factory', owner: army, capturePoints: 20 };
    terrain[h.y - d.y]![h.x - d.x] = { kind: 'city', owner: army, capturePoints: 20 };
  });
  return { board: { width: rows[0].length, height: rows.length, terrain }, homes, bridges };
}

export function createAsymmetricLayout(source: AsymmetricSource, match: ExpandedBattle, seed: number, rules?: FourArmyRules): FourArmyMap {
  const siteArmies = match.siteArmies!;
  const { board, homes, bridges } = asymmetricBoard(source, siteArmies, match.layoutVersion);
  const units: FourArmyMap['units'] = [];
  const players = {} as FourArmyMap['players'];
  const startZones = {} as NonNullable<FourArmyMap['setup']>['startZones'];
  const starts: readonly [UnitKind, number, number][] = [
    ['infantry', -1, 1],
    ['infantry', 1, 1],
    ['recon', 0, 2],
    ['tank', 0, 1],
  ];
  siteArmies.forEach((army, site) => {
    const h = homes[army],
      d = forward[site]!;
    const local = (side: number, front: number): Position => ({ x: h.x + front * d.x + side * d.y, y: h.y + front * d.y - side * d.x });
    const first = local(-1, -1),
      last = local(1, 2);
    startZones[army] = { x: Math.min(first.x, last.x), y: Math.min(first.y, last.y), width: Math.abs(last.x - first.x) + 1, height: Math.abs(last.y - first.y) + 1 };
    players[army] = { gold: 6000, income: 0 };
    for (const [kind, side, front] of starts) {
      const stats = unitStats[kind],
        secondary = weaponsForUnit(kind, { ruleVersion: 12 })[1];
      units.push({
        id: `u${units.length + 1}`,
        owner: army,
        kind,
        position: local(side, front),
        hp: 100,
        fuel: stats.fuel,
        ammo: stats.ammo,
        ...(secondary ? { secondaryAmmo: secondary.ammo } : {}),
        hasMoved: false,
        hasActed: false,
      });
    }
  });
  return {
    id: `${source}-multi-${match.participants.join('-')}-v${match.layoutVersion}`,
    match,
    board,
    capitals: homes,
    units,
    players,
    order: [...match.initialOrder],
    seed,
    pathVersion: 3,
    bridges,
    setup: { version: 1, unitLimitPerArmy: 8, startZones },
    ...(rules ? { rules: structuredClone(rules) } : {}),
  };
}
