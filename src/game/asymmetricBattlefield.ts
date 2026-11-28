import type { FourArmyMap, FourArmyTerrain } from './fourArmyEngine';
import type { FourArmyId } from './fourArmyFoundation';
import type { ExpandedBattle } from './smallBattle';
import type { FourArmyRules } from './fourArmyRules';
import type { Position, UnitKind } from './types';
import { unitStats } from './units';
import { weaponsForUnit } from './weapons';

export type AsymmetricSource = 'encirclement' | 'crown' | 'canyon' | 'marsh' | 'river' | 'tundra';
export function isAsymmetricSource(source: unknown): source is AsymmetricSource {
  return source === 'encirclement' || source === 'crown' || source === 'canyon' || source === 'marsh' || source === 'river' || source === 'tundra';
}

export function isFixedFourArmySource(source: unknown): source is 'crown' | 'encirclement' {
  return source === 'crown' || source === 'encirclement';
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
type SiteUnit = readonly [kind: UnitKind, side: number, front: number];
type SiteFacility = readonly [kind: 'factory' | 'city' | 'airport', side: number, front: number];
interface SiteResources {
  readonly gold: number;
  readonly units: readonly SiteUnit[];
  readonly facilities: readonly SiteFacility[];
}

const standardSite: SiteResources = {
  gold: 6000,
  units: [
    ['infantry', -1, 1],
    ['infantry', 1, 1],
    ['recon', 0, 2],
    ['tank', 0, 1],
  ],
  facilities: [
    ['factory', -1, 0],
    ['city', 0, -1],
  ],
};
const centralSite: SiteResources = {
  gold: 8000,
  units: [
    ['infantry', -1, -1],
    ['infantry', 1, 1],
    ['rocket', 0, -1],
    ['tank', 1, 0],
    ['heavyTank', 0, 0],
    ['mech', -1, 1],
    ['tank', 0, 2],
  ],
  facilities: [...standardSite.facilities, ['city', -2, 0], ['city', 2, 0], ['city', -1, -1], ['city', 1, -1]],
};

export const encirclementHegemonLimit = 10;
export const encirclementAllianceLimit = 6;

const hegemonSite: SiteResources = {
  gold: 16000,
  units: [
    ['infantry', -1, 1],
    ['infantry', 1, 1],
    ['rocket', 0, 0],
    ['tank', 1, 0],
    ['heavyTank', -1, 0],
    ['heavyTank', 0, 2],
    ['antiAir', 0, 1],
    ['bomber', 0, -1],
    ['mech', -1, 2],
    ['heavyTank', 1, 2],
  ],
  facilities: [
    ['factory', -2, 0],
    ['factory', 2, 0],
    ['airport', 0, -1],
    ['city', -3, 0],
    ['city', 3, 0],
    ['city', -2, 2],
    ['city', 2, 2],
    ['city', -2, -1],
    ['city', 2, -1],
  ],
};

export function siteTeam(source: ExpandedBattle['sourceMapId'], sites: readonly FourArmyId[], army: FourArmyId): FourArmyId {
  return (source === 'tundra' || source === 'encirclement') && army !== sites[0] ? sites[1]! : army;
}

export function startingSiteResources(source: AsymmetricSource, site: number): SiteResources {
  if (site !== 0) return standardSite;
  return source === 'encirclement' ? hegemonSite : source === 'crown' ? centralSite : standardSite;
}

// Version 6 has four permanent sites. All relative offsets below refer to the site's approach direction.
const crownRows = [
  '++##..........##++',
  '+.................',
  '.....c......c.....',
  '....B.=....=.C....',
  '..c...=c..c=...c..',
  '....===....===....',
  '.....===A====.....',
  '....=...=....=....',
  '..c.=...=....=.c..',
  '....==..=...==....',
  '..+...........+...',
  '...#.....D....#...',
  '...+..........+...',
  '....#...++...#....',
] as const;

// Version 7 fixes the two teams to their sites. The ridge has three crossings.
const encirclementRows = [
  '..##..........##..',
  '...+..........+...',
  '........A.........',
  '..====..=..=====..',
  '..=..c..=..c...=..',
  '###=####=#####=###',
  '...=....=.....=...',
  '..c=....=.....=c..',
  '..B==...c...===C..',
  '....====.=====....',
  '......+.=.+.......',
  '........D.........',
  '...+..........+...',
  '..................',
] as const;

function sitePosition(home: Position, site: number, side: number, front: number): Position {
  const d = forward[site]!;
  return { x: home.x + front * d.x + side * d.y, y: home.y + front * d.y - side * d.x };
}
export function asymmetricBoard(source: AsymmetricSource, siteArmies: readonly FourArmyId[], layoutVersion = 5) {
  const count = siteArmies.length === 3 ? 3 : 4;
  const rows =
    source === 'encirclement'
      ? encirclementRows
      : source === 'crown'
        ? crownRows
        : source === 'tundra'
          ? layouts.tundra[3]
          : layoutVersion === 4 && source !== 'river'
            ? historicalLayouts[source][count]
            : layouts[source][count];
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
    for (const [kind, side, front] of startingSiteResources(source, site).facilities) {
      const p = sitePosition(homes[army], site, side, front);
      terrain[p.y]![p.x] = { kind, owner: army, capturePoints: 20 };
    }
  });
  return { board: { width: rows[0].length, height: rows.length, terrain }, homes, bridges };
}

export function createAsymmetricLayout(source: AsymmetricSource, match: ExpandedBattle, seed: number, rules?: FourArmyRules): FourArmyMap {
  const siteArmies = match.siteArmies!;
  const { board, homes, bridges } = asymmetricBoard(source, siteArmies, match.layoutVersion);
  const units: FourArmyMap['units'] = [];
  const players = {} as FourArmyMap['players'];
  const startZones = {} as NonNullable<FourArmyMap['setup']>['startZones'];
  siteArmies.forEach((army, site) => {
    const resources = startingSiteResources(source, site);
    const local = (side: number, front: number) => sitePosition(homes[army], site, side, front);
    const first = local(-1, -1),
      last = local(1, 2);
    startZones[army] = { x: Math.min(first.x, last.x), y: Math.min(first.y, last.y), width: Math.abs(last.x - first.x) + 1, height: Math.abs(last.y - first.y) + 1 };
    players[army] = { gold: resources.gold, income: 0 };
    for (const [kind, side, front] of resources.units) {
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
    setup: { version: 1, unitLimitPerArmy: source === 'encirclement' ? encirclementHegemonLimit : 8, startZones },
    ...(rules ? { rules: structuredClone(rules) } : {}),
  };
}
