import type { PlayerId, TerrainKind, UnitKind } from '../game';
import { getLocale, localized } from './locale';

/**
 * Display names shared by the board, the panels, and the tile inspector. They
 * live here so a label is written once and every surface agrees on it.
 */
export const terrainNames = localized<Record<TerrainKind, string>>({
  plain: '平原', forest: '森林', mountain: '山岳', road: '道路', swamp: '沼地', sea: '海',
  city: '都市', factory: '工場', airport: '空港', port: '港湾', capital: '司令部',
}, { plain: 'Plains', forest: 'Forest', mountain: 'Mountain', road: 'Road', swamp: 'Swamp', sea: 'Sea', city: 'City', factory: 'Factory', airport: 'Airport', port: 'Port', capital: 'Headquarters' });

export const unitNames = localized<Record<UnitKind, string>>({
  infantry: '歩兵', tank: '戦車', artillery: '砲兵', fighter: '戦闘機', bomber: '爆撃機',
  destroyer: '駆逐艦', landingShip: '輸送艦', recon: '偵察車', rocket: '自走砲', antiAir: '対空車両', apc: '装甲兵員輸送車',
  mech: '対戦車歩兵', heavyTank: '重戦車', helicopter: '戦闘ヘリ', battleship: '戦艦',
}, { infantry: 'Infantry', tank: 'Tank', artillery: 'Artillery', fighter: 'Fighter', bomber: 'Bomber', destroyer: 'Destroyer', landingShip: 'Landing ship', recon: 'Recon', rocket: 'Rocket artillery', antiAir: 'Anti-air', apc: 'APC', mech: 'Mech infantry', heavyTank: 'Heavy tank', helicopter: 'Helicopter', battleship: 'Battleship' });

export const unitTokens: Record<UnitKind, string> = {
  infantry: '歩', tank: '戦', artillery: '砲', fighter: '空', bomber: '爆',
  destroyer: '艦', landingShip: '輸', recon: '偵', rocket: '自', antiAir: '防', apc: '装',
  mech: '対', heavyTank: '重', helicopter: 'ヘ', battleship: '巨',
};

/** Rank titles for experience ranks 0-3 (大戦略-style veterancy). */
export const rankNames = ['新兵', '古参', '精鋭', '英雄'] as const;

/** Compact rank marker for the board; unranked units show nothing. */
export const rankStars = (rank: number): string => '★'.repeat(rank);

/** Relative side label: the viewer's own force versus the opposing force. */
export const sideLabel = (owner: PlayerId, viewer: PlayerId): string => getLocale() === 'en' ? (owner === viewer ? 'Friendly' : 'Enemy') : owner === viewer ? '自軍' : '敵軍';

/** Ownership label for a capturable property, which may still be unclaimed. */
export const ownerLabel = (owner: PlayerId | undefined, viewer: PlayerId): string =>
  owner === undefined ? (getLocale() === 'en' ? 'Neutral' : '中立') : sideLabel(owner, viewer);
