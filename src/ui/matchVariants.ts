import { authoredBattlefield, authoredFourSources, isAuthoredFourSource } from '../game/asymmetricFourSites';
import { isAsymmetricSource, isFixedFourArmySource, type AsymmetricSource } from '../game/asymmetricBattlefield';
import { getLocale, localized } from './locale';
import { escapeHtml } from './strings';

export type ArmyCount = 2 | 3 | 4;
export type MultiplayerMap = 'compact' | 'outpost' | 'strait' | 'frontier' | 'wide' | AsymmetricSource;

const displayLanguage = () => (getLocale() === 'en' ? 1 : 0);

const names = localized(
  {
    encirclement: '覇権国と包囲同盟',
    crown: '中央の大国',
    river: '渡河作戦',
    tundra: '凍土の防衛線',
    canyon: '峡谷の関門',
    marsh: '湿地の突破',
    compact: '緑の国境',
    outpost: '前哨基地強襲',
    strait: '交差海峡',
    frontier: '新・四方の前線',
    wide: '四方の前線',
  },
  {
    encirclement: 'Hegemon and Encircling Alliance',
    crown: 'Central Power',
    river: 'River Crossing',
    tundra: 'Frozen Defense Line',
    canyon: 'Canyon Checkpoint',
    marsh: 'Marsh Breakthrough',
    compact: 'Green Border',
    outpost: 'Outpost Assault',
    strait: 'Cross Strait',
    frontier: 'New Four Fronts',
    wide: 'Four Fronts',
  },
);

const briefings = localized(
  {
    encirclement: '北の覇権国は工場2か所と空港を持ち、山脈の3つの峠を守る。西・東・南の3軍は包囲同盟として通常視界を共有し、それぞれの峠から北へ進む。',
    crown: '中央は複数の都市と放射状の道路を持ち、三方が開けています。外縁の三国は森や山を背に、中央へ進路を取れます。',
    compact: '各軍の司令部の近くに工場と都市があります。近くの拠点から前線を広げます。',
    outpost: '森に囲まれた工場と、中央に集まる都市をめぐって争います。',
    canyon: '中央へ向かう街道と、山沿いの迂回路があります。峠を越える進路を出発地点から選びます。',
    marsh: '湿地を横切る近道と、外周の乾いた道では部隊の進みやすさが異なります。',
    river: '各岸の司令部から川に向かって進みます。橋を押さえると対岸の拠点へ進めます。',
    tundra: '北の守備軍に対し、西と東の攻撃軍がチームを組んで両側の峠から進みます。',
    strait: '各軍は港から出発できます。橋を渡る陸路と、海峡を進む航路を使い分けます。',
    frontier: '広い戦域に司令部が点在します。前線の工場や都市を押さえながら進みます。',
    wide: '四隅の司令部を道路が結びます。各軍は工場と空港のある陣地から進みます。',
  },
  {
    encirclement:
      'The northern hegemon has two factories and an airport behind three mountain passes. The western, eastern and southern armies form an alliance, share ordinary vision and advance north along separate approaches.',
    crown: 'The central power holds more cities and radial roads, with three exposed approaches. Three border powers can advance from the shelter of woods and mountains.',
    compact: 'Factories and cities stand near each headquarters. Expand the front from these nearby properties.',
    outpost: 'Fight for the factories near the woods and the cluster of cities at the center.',
    canyon: 'Choose a starting site along the central highway or a route around the mountain ridge.',
    marsh: 'The shortcut across the wetlands and the dry perimeter road favor different approaches.',
    river: 'Advance from the banks toward the river. Control a bridge to reach properties on the opposite bank.',
    tundra: 'The western and eastern attackers advance through the passes together against the northern defender.',
    strait: 'Each army has a port. Cross the bridges with land units or take the sea route through the strait.',
    frontier: 'Headquarters are spread across a wide battlefield. Use forward factories and cities as you advance.',
    wide: 'Roads connect the four corners. Each army starts with a factory and an airport near headquarters.',
  },
);
export const multiplayerBriefing = (map: MultiplayerMap): string => (isAuthoredFourSource(map) ? authoredBattlefield(map).briefing[displayLanguage()] : briefings[map]);

export const multiplayerOnlyMaps = ['strait', 'frontier', 'wide', 'crown', 'encirclement', ...authoredFourSources] as const;
export const multiplayerMaps = ['compact', 'outpost', 'canyon', 'marsh', 'river', 'tundra', ...multiplayerOnlyMaps] as const;
export const encirclementTeamName = (hegemon: boolean) => (hegemon ? encirclementTeams.hegemon : encirclementTeams.alliance);
const encirclementTeams = localized({ hegemon: '覇権国', alliance: '包囲同盟' }, { hegemon: 'Hegemon', alliance: 'Encircling alliance' });
export const multiplayerName = (map: MultiplayerMap): string => (isAuthoredFourSource(map) ? authoredBattlefield(map).title[displayLanguage()] : names[map]);

export const authoredTeamLabel = (map: unknown, site: number): string | undefined =>
  isAuthoredFourSource(map) ? authoredBattlefield(map).teamNames?.[site]?.[displayLanguage()] : undefined;
export const fixedTeamFormat = (map: unknown): string | undefined => {
  const language = displayLanguage();
  if (map === 'encirclement') return ['覇権国1軍・包囲同盟3軍', '1 hegemon vs 3 allied armies'][language];
  if (map === 'ocean-alliance') return ['海洋同盟2軍・大陸同盟2軍', '2 oceanic vs 2 continental armies'][language];
  if (map === 'sandwiched-alliance') return ['単独2軍・同盟2軍（1対1対2）', 'Two independent armies vs a two-army alliance'][language];
  return undefined;
};
export const multiplayerSize = (map: MultiplayerMap): { width: number; height: number } =>
  map === 'strait' ? { width: 17, height: 15 } : map === 'frontier' || map === 'wide' ? { width: 32, height: 32 } : { width: 18, height: 14 };
export const classicVariant = (map: MultiplayerMap): string | undefined =>
  map === 'compact' ? 'skirmish' : map === 'outpost' || (isAsymmetricSource(map) && !isFixedFourArmySource(map)) ? map : undefined;
export const multiplayerVariant = (id: string): MultiplayerMap | undefined =>
  id === 'skirmish' ? 'compact' : id === 'outpost' || (isAsymmetricSource(id) && !isFixedFourArmySource(id)) ? id : undefined;
export const multiplayerCardId = (map: MultiplayerMap): string => `multiplayer:${map}`;

export function armyCountOptions(map: MultiplayerMap): readonly ArmyCount[] {
  return map === 'wide' || isFixedFourArmySource(map) ? [4] : map === 'tundra' ? [3] : isAsymmetricSource(map) ? [3, 4] : [2, 3, 4];
}

const labels = localized(
  { standard: '通常の2軍', two: '2軍（複数軍ルール）', three: '3軍', four: '4軍', label: '参加軍数・規則', range: '2〜4軍', fixed: '固定4軍', defense: '2・3軍' },
  {
    standard: 'Standard two-army',
    two: '2 armies (multiplayer rules)',
    three: '3 armies',
    four: '4 armies',
    label: 'Army count and rules',
    range: '2–4 armies',
    fixed: 'Fixed 4 armies',
    defense: '2 or 3 armies',
  },
);

export const armyCountLabel = (map: MultiplayerMap): string => (map === 'wide' || isFixedFourArmySource(map) ? labels.fixed : map === 'tundra' ? labels.defense : labels.range);

export function renderMatchVariants(map: MultiplayerMap, current: 'standard' | ArmyCount, id: string): string {
  const variants: { value: string; label: string }[] = armyCountOptions(map).map((count) => ({
    value: String(count),
    label: count === 2 ? labels.two : count === 3 ? labels.three : labels.four,
  }));
  if (classicVariant(map)) variants.unshift({ value: 'standard', label: labels.standard });
  const group = escapeHtml(id);
  return `<fieldset id="${group}" class="match-variants"><legend>${labels.label}</legend>${variants.map(({ value, label }) => `<label><input type="radio" id="${group}-${value}" name="${group}" data-match-variant="${value}" value="${value}" ${value === String(current) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</fieldset>`;
}
