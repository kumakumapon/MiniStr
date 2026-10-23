import { japaneseUnitNames, englishUnitNames } from './unitNameText';
import { unitWeapons, weaponsForUnit, type GameState, type PlayerId, type TerrainKind, type UnitKind, type WeaponKind } from '../game';
import { getLocale, localized } from './locale';

/**
 * Display names shared by the board, the panels, and the tile inspector. They
 * live here so a label is written once and every surface agrees on it.
 */
export const terrainNames = localized<Record<TerrainKind, string>>({
  plain: '平原', forest: '森林', mountain: '山岳', road: '道路', swamp: '沼地', sea: '海',
  supplyDepot: '前線補給所', city: '都市', factory: '工場', airport: '空港', port: '港湾', capital: '司令部',
}, { supplyDepot: 'Supply depot', plain: 'Plains', forest: 'Forest', mountain: 'Mountain', road: 'Road', swamp: 'Swamp', sea: 'Sea', city: 'City', factory: 'Factory', airport: 'Airport', port: 'Port', capital: 'Headquarters' });

export const unitNames = localized(japaneseUnitNames, englishUnitNames);

export const unitTokens = localized<Record<UnitKind, string>>({
  engineer: '工', infantry: '歩', tank: '戦', artillery: '砲', fighter: '空', bomber: '爆',
  destroyer: '艦', landingShip: '輸', recon: '偵', rocket: '自', antiAir: '防', apc: '装',
  mech: '対', heavyTank: '重', helicopter: 'ヘ', battleship: '巨',
}, {
  engineer: 'E', infantry: 'I', tank: 'T', artillery: 'A', fighter: 'F', bomber: 'B',
  destroyer: 'D', landingShip: 'L', recon: 'R', rocket: 'RK', antiAir: 'AA', apc: 'AP',
  mech: 'M', heavyTank: 'HT', helicopter: 'H', battleship: 'BS',
});

export const weaponNames = localized<Record<WeaponKind, string>>({
  rifle: '小銃', machineGun: '機関銃', tankCannon: '戦車砲', howitzer: '榴弾砲', rocketLauncher: '多連装ロケット',
  antiAirCannon: '対空機関砲', airMissile: '航空ミサイル', bomb: '爆弾', navalGun: '艦砲',
  antiTankLauncher: '対戦車ロケット', heavyTankCannon: '重戦車砲', helicopterRocket: '航空ロケット', heavyNavalGun: '大口径艦砲',
}, {
  rifle: 'Rifle', machineGun: 'Machine gun', tankCannon: 'Tank cannon', howitzer: 'Howitzer', rocketLauncher: 'Rocket launcher',
  antiAirCannon: 'Anti-air cannon', airMissile: 'Aircraft missile', bomb: 'Bomb', navalGun: 'Naval gun',
  antiTankLauncher: 'Anti-tank rocket', heavyTankCannon: 'Heavy tank cannon', helicopterRocket: 'Helicopter rocket', heavyNavalGun: 'Heavy naval gun',
});

export function unitWeaponName(kind: UnitKind, state?: Pick<GameState, 'ruleVersion'>): string {
  if (state) {
    const names = weaponsForUnit(kind, state).map(weapon => weaponNames[weapon.kind]);
    if (names.length) return names.join(' / ');
  }
  const weapon = unitWeapons[kind];
  return weapon === null ? (getLocale() === 'en' ? 'Unarmed' : '非武装') : weaponNames[weapon];
}

/** Rank titles for experience ranks 0-3 (大戦略-style veterancy). */
export const rankNames = localized<Record<number, string>>(
  { 0: '新兵', 1: '古参', 2: '精鋭', 3: '英雄' },
  { 0: 'Recruit', 1: 'Veteran', 2: 'Elite', 3: 'Hero' },
);

/** Compact rank marker for the board; unranked units show nothing. */
export const rankStars = (rank: number): string => '★'.repeat(rank);

/** Relative side label: the viewer's own force versus the opposing force. */
export const sideLabel = (owner: PlayerId, viewer: PlayerId): string => getLocale() === 'en' ? (owner === viewer ? 'Friendly' : 'Enemy') : owner === viewer ? '自軍' : '敵軍';

/** Ownership label for a capturable property, which may still be unclaimed. */
export const ownerLabel = (owner: PlayerId | undefined, viewer: PlayerId): string =>
  owner === undefined ? (getLocale() === 'en' ? 'Neutral' : '中立') : sideLabel(owner, viewer);
