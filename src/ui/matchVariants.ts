import { isAsymmetricSource, type AsymmetricSource } from '../game/asymmetricBattlefield';
import { localized } from './locale';
import { escapeHtml } from './strings';

export type ArmyCount = 2 | 3 | 4;
export type MultiplayerMap = 'compact' | 'outpost' | 'strait' | 'frontier' | 'wide' | AsymmetricSource;

const names = localized(
  { canyon: '峡谷の関門', marsh: '湿地の突破', compact: '緑の国境', outpost: '前哨基地強襲', strait: '交差海峡', frontier: '新・四方の前線', wide: '四方の前線' },
  {
    canyon: 'Canyon Checkpoint',
    marsh: 'Marsh Breakthrough',
    compact: 'Green Border',
    outpost: 'Outpost Assault',
    strait: 'Cross Strait',
    frontier: 'New Four Fronts',
    wide: 'Four Fronts',
  },
);

export const multiplayerOnlyMaps = ['strait', 'frontier', 'wide'] as const;
export const multiplayerName = (map: MultiplayerMap): string => names[map];
export const multiplayerSize = (map: MultiplayerMap): { width: number; height: number } =>
  map === 'strait' ? { width: 17, height: 15 } : map === 'frontier' || map === 'wide' ? { width: 32, height: 32 } : { width: 18, height: 14 };
export const classicVariant = (map: MultiplayerMap): string | undefined => (map === 'compact' ? 'skirmish' : map === 'outpost' || isAsymmetricSource(map) ? map : undefined);
export const multiplayerVariant = (id: string): MultiplayerMap | undefined => (id === 'skirmish' ? 'compact' : id === 'outpost' || isAsymmetricSource(id) ? id : undefined);
export const multiplayerCardId = (map: MultiplayerMap): string => `multiplayer:${map}`;

export function armyCountOptions(map: MultiplayerMap): readonly ArmyCount[] {
  return map === 'wide' ? [4] : isAsymmetricSource(map) ? [3, 4] : [2, 3, 4];
}

const labels = localized(
  { standard: '通常の2軍', two: '2軍（複数軍ルール）', three: '3軍', four: '4軍', label: '参加軍数・規則', range: '2〜4軍', fixed: '固定4軍' },
  {
    standard: 'Standard two-army',
    two: '2 armies (multiplayer rules)',
    three: '3 armies',
    four: '4 armies',
    label: 'Army count and rules',
    range: '2–4 armies',
    fixed: 'Fixed 4 armies',
  },
);

export const armyCountLabel = (map: MultiplayerMap): string => (map === 'wide' ? labels.fixed : labels.range);

export function renderMatchVariants(map: MultiplayerMap, current: 'standard' | ArmyCount, id: string): string {
  const variants: { value: string; label: string }[] = armyCountOptions(map).map((count) => ({
    value: String(count),
    label: count === 2 ? labels.two : count === 3 ? labels.three : labels.four,
  }));
  if (classicVariant(map)) variants.unshift({ value: 'standard', label: labels.standard });
  return `<label class="match-variants">${labels.label}<select id="${escapeHtml(id)}">${variants.map(({ value, label }) => `<option value="${value}" ${value === String(current) ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
}
