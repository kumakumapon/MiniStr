import type { UnitKind } from '../game/types';

/** Shared source names also let stored UI activity be rendered in either locale. */
export const japaneseUnitNames: Record<UnitKind, string> = {
  engineer: '工兵',
  infantry: '歩兵',
  tank: '戦車',
  artillery: '砲兵',
  fighter: '戦闘機',
  bomber: '爆撃機',
  destroyer: '駆逐艦',
  landingShip: '輸送艦',
  recon: '偵察車',
  rocket: '自走砲',
  antiAir: '対空車両',
  apc: '装甲兵員輸送車',
  mech: '対戦車歩兵',
  heavyTank: '重戦車',
  helicopter: '戦闘ヘリ',
  battleship: '戦艦',
};
export const englishUnitNames: Record<UnitKind, string> = {
  engineer: 'Engineer',
  infantry: 'Infantry',
  tank: 'Tank',
  artillery: 'Artillery',
  fighter: 'Fighter',
  bomber: 'Bomber',
  destroyer: 'Destroyer',
  landingShip: 'Landing ship',
  recon: 'Recon',
  rocket: 'Rocket artillery',
  antiAir: 'Anti-air',
  apc: 'APC',
  mech: 'Mech infantry',
  heavyTank: 'Heavy tank',
  helicopter: 'Helicopter',
  battleship: 'Battleship',
};
