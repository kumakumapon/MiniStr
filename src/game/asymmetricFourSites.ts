import type { FourArmyId } from './fourArmyFoundation';
import type { UnitKind } from './types';

type Facility = 'factory' | 'city' | 'airport' | 'port';
type SiteUnit = readonly [kind: UnitKind, x: number, y: number, embarked?: true];
type SiteFacility = readonly [kind: Facility, x: number, y: number];
export interface NewSiteResources {
  readonly gold: number;
  readonly units: readonly SiteUnit[];
  readonly facilities: readonly SiteFacility[];
}
type Copy = readonly [japanese: string, english: string];
interface Battlefield {
  title: Copy;
  briefing: Copy;
  terrain: readonly string[];
  regions: readonly Copy[];
  teams?: readonly [number, number, number, number];
  teamNames?: readonly Copy[];
  theme: 'coastal' | 'temperate';
  sites: readonly [NewSiteResources, NewSiteResources, NewSiteResources, NewSiteResources];
}

export const authoredFourSites = {
  'ocean-alliance': {
    title: ['海洋同盟と大陸同盟', 'Oceanic and Continental Alliances'],
    briefing: [
      '北島と南島の海洋同盟は前線の輸送艦に歩兵を乗せた状態から大陸の両岸を狙う。大陸同盟の西軍と東軍は街道で合流でき、港から島を攻められる。固定2対2。最後の生存チームが勝利する。',
      'The oceanic allies begin with infantry aboard transports off separate northern and southern islands. Their continental opponents can reinforce one another overland or sail from their own ports. Teams are fixed at two versus two; the last team standing wins.',
    ],
    theme: 'coastal',
    teams: [0, 0, 2, 2],
    teamNames: [
      ['海洋同盟', 'Oceanic alliance'],
      ['海洋同盟', 'Oceanic alliance'],
      ['大陸同盟', 'Continental alliance'],
      ['大陸同盟', 'Continental alliance'],
    ],
    regions: [
      ['北島・大陸北岸への航路', 'North island · route to the north shore'],
      ['南島・大陸南岸への航路', 'South island · route to the south shore'],
      ['大陸西・街道と西の港', 'West mainland · highway and western port'],
      ['大陸東・街道と東の港', 'East mainland · highway and eastern port'],
    ],
    terrain: [
      'wwwwwwwwwwwwwwwwww',
      'wwww......wwwwwwww',
      'www...A....wwwwwww',
      'www........wwwwwww',
      'wwwwwwwwwwwwwwwwww',
      'ww....=c..==...www',
      'w..C===========D.w',
      'w...=.c...c.=....w',
      'w.....===c=......w',
      'ww.......c......ww',
      'wwwwwwwwwwwwwwwwww',
      'wwwwww...B.....www',
      'wwwww..........www',
      'wwwwwwwwwwwwwwwwww',
    ],
    sites: [
      {
        gold: 10500,
        facilities: [
          ['factory', 6, 1],
          ['city', 5, 2],
          ['port', 4, 3],
          ['port', 9, 3],
        ],
        units: [
          ['infantry', 4, 3],
          ['landingShip', 4, 4],
          ['landingShip', 9, 4],
          ['infantry', 9, 4, true],
          ['battleship', 6, 4],
          ['tank', 6, 3],
          ['mech', 7, 3],
        ],
      },
      {
        gold: 10500,
        facilities: [
          ['factory', 9, 12],
          ['city', 10, 12],
          ['port', 7, 11],
          ['port', 13, 11],
        ],
        units: [
          ['infantry', 7, 11],
          ['landingShip', 7, 10],
          ['landingShip', 12, 10],
          ['infantry', 12, 10, true],
          ['battleship', 10, 10],
          ['tank', 10, 11],
          ['mech', 11, 11],
        ],
      },
      {
        gold: 4000,
        facilities: [
          ['factory', 2, 6],
          ['city', 2, 7],
          ['city', 3, 8],
          ['port', 3, 5],
        ],
        units: [
          ['infantry', 4, 5],
          ['infantry', 5, 6],
          ['tank', 4, 6],
          ['recon', 3, 7],
          ['landingShip', 3, 5],
          ['destroyer', 1, 5],
        ],
      },
      {
        gold: 4000,
        facilities: [
          ['factory', 16, 7],
          ['city', 15, 8],
          ['city', 15, 7],
          ['port', 14, 9],
        ],
        units: [
          ['infantry', 14, 6],
          ['infantry', 14, 8],
          ['tank', 13, 7],
          ['recon', 13, 8],
          ['landingShip', 14, 10],
          ['destroyer', 16, 9],
        ],
      },
    ],
  },
  'sandwiched-alliance': {
    title: ['挟まれた同盟', 'Sandwiched Alliance'],
    briefing: [
      '中央の西軍と東軍は同盟を結び、北軍と南軍はそれぞれ単独で戦う。両側の中立都市へは北軍・南軍ともに別々の道を取れる。固定1対1対2。',
      'The central west and east armies form an alliance. North and south fight independently against both the alliance and each other. Separate roads let the two independent armies contest neutral towns on either flank.',
    ],
    theme: 'temperate',
    teams: [0, 1, 1, 3],
    teamNames: [
      ['北の単独軍', 'Northern independent'],
      ['中央同盟', 'Central alliance'],
      ['中央同盟', 'Central alliance'],
      ['南の単独軍', 'Southern independent'],
    ],
    regions: [
      ['北・北部の街道', 'North · northern highway'],
      ['西中部・西の平原', 'Central west · western plains'],
      ['東中部・東の平原', 'Central east · eastern plains'],
      ['南・南部の街道', 'South · southern highway'],
    ],
    terrain: [
      '..+............+..',
      '.....====A===.....',
      '..==...=...=...=..',
      '..=c...=...=..c=..',
      '..=..~~=...=~~.=..',
      '..=...==...==..=..',
      '..=.B==..f.==C.=..',
      '..=..===...===.=..',
      '..=....=...=...=..',
      '..=..~~=...=~~.=..',
      '..=c...=...=..c=..',
      '..====.=...=.===..',
      '.....====D===.....',
      '..+............+..',
    ],
    sites: [
      {
        gold: 10000,
        facilities: [
          ['factory', 7, 1],
          ['factory', 11, 1],
          ['city', 9, 0],
          ['city', 5, 2],
        ],
        units: [
          ['infantry', 7, 2],
          ['infantry', 11, 2],
          ['tank', 8, 2],
          ['artillery', 9, 2],
          ['mech', 10, 2],
        ],
      },
      {
        gold: 5000,
        facilities: [
          ['factory', 4, 5],
          ['city', 3, 7],
        ],
        units: [
          ['infantry', 4, 7],
          ['infantry', 5, 5],
          ['tank', 5, 6],
          ['artillery', 6, 6],
        ],
      },
      {
        gold: 5000,
        facilities: [
          ['factory', 13, 7],
          ['city', 14, 5],
        ],
        units: [
          ['infantry', 12, 7],
          ['infantry', 13, 5],
          ['tank', 12, 6],
          ['artillery', 13, 8],
        ],
      },
      {
        gold: 10000,
        facilities: [
          ['factory', 7, 12],
          ['factory', 11, 12],
          ['city', 9, 13],
          ['city', 13, 11],
        ],
        units: [
          ['infantry', 7, 11],
          ['infantry', 11, 11],
          ['tank', 8, 11],
          ['artillery', 9, 11],
          ['mech', 10, 11],
        ],
      },
    ],
  },
  'four-homelands': {
    title: ['四つの国土', 'Four Homelands'],
    briefing: [
      '北西の平原軍は工場2か所、北東の山岳軍は歩兵と砲兵、南西の水郷軍は水路と港、南東の群島軍は艦船と航空機を使う。群島の歩兵は輸送艦や輸送ヘリで本土へ進める。',
      'The northwest plains supply armour, the northeast mountains favor infantry and artillery, and the southwest wetlands favor river fleets. In the southeast, island infantry can reach the mainland by landing ship or helicopter.',
    ],
    theme: 'coastal',
    regions: [
      ['北西・道路の平原', 'Northwest · open roads'],
      ['北東・山岳と森', 'Northeast · mountain woods'],
      ['南西・水郷と港', 'Southwest · channels and ports'],
      ['南東・沖合の群島', 'Southeast · offshore islands'],
    ],
    terrain: [
      '.....=......#.+.#.',
      '..A========.+B..#.',
      '..==....#..+..+.#.',
      '...=c..#...#...+..',
      '..=======c====....',
      '...=...==..=......',
      '....==.c...=..cwww',
      'www~..===...wwwwww',
      'ww~~ww~=...wwwwwww',
      'w~~~~w~~=..www...w',
      'w~C~~w~~=..ww....w',
      'ww~~~w~~=...w.D..w',
      'www~~~~~...www...w',
      'wwwwwwwwwwwwwwwwww',
    ],
    sites: [
      {
        gold: 6000,
        facilities: [
          ['factory', 2, 2],
          ['factory', 5, 1],
          ['city', 3, 1],
        ],
        units: [
          ['infantry', 3, 2],
          ['infantry', 4, 3],
          ['tank', 5, 2],
          ['tank', 5, 3],
          ['artillery', 2, 3],
        ],
      },
      {
        gold: 6000,
        facilities: [
          ['factory', 13, 2],
          ['city', 14, 1],
          ['city', 15, 3],
        ],
        units: [
          ['infantry', 12, 2],
          ['infantry', 13, 3],
          ['mech', 14, 3],
          ['artillery', 12, 3],
          ['antiAir', 14, 2],
        ],
      },
      {
        gold: 8000,
        facilities: [
          ['factory', 3, 10],
          ['port', 3, 9],
          ['port', 2, 11],
        ],
        units: [
          ['infantry', 3, 8],
          ['infantry', 3, 11],
          ['landingShip', 4, 8],
          ['landingShip', 2, 12],
          ['destroyer', 1, 11],
          ['mech', 4, 10],
        ],
      },
      {
        gold: 12500,
        facilities: [
          ['airport', 15, 11],
          ['port', 14, 9],
          ['port', 16, 12],
        ],
        units: [
          ['infantry', 14, 9],
          ['infantry', 16, 12],
          ['landingShip', 14, 8],
          ['landingShip', 16, 13],
          ['transportHelicopter', 16, 11],
          ['destroyer', 12, 11],
          ['bomber', 14, 10],
        ],
      },
    ],
  },
} as const satisfies Record<string, Battlefield>;

export type AuthoredFourSource = keyof typeof authoredFourSites;
export const authoredFourSources = Object.keys(authoredFourSites) as AuthoredFourSource[];
export const isAuthoredFourSource = (source: unknown): source is AuthoredFourSource => typeof source === 'string' && Object.hasOwn(authoredFourSites, source);
export const authoredBattlefield = (source: AuthoredFourSource): Battlefield => authoredFourSites[source];

export function authoredSiteTeam(source: AuthoredFourSource, sites: readonly FourArmyId[], army: FourArmyId): FourArmyId {
  const index = sites.indexOf(army);
  const teamSite = authoredBattlefield(source).teams?.[index];
  return teamSite === undefined ? army : sites[teamSite]!;
}

export const coastalFourSource = (source: unknown): boolean => source === 'strait' || (isAuthoredFourSource(source) && authoredBattlefield(source).theme === 'coastal');
