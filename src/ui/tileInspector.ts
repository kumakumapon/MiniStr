import { canServiceUnitAt, defaultProductionRule, defenseStars, experienceRank, isDeployedUnit, isGroundUnit, MAX_EXPERIENCE, remainingAmmo, weaponAmmo, weaponsForUnit, usesModernRules, isPropertyTerrainKind, movementCost, productionKindsForRule, terrainAt, type ProductionRule, unitStats, type GameState, type PlayerId, type Position, type UnitKind } from '../game';
import { capturePointsLabel, observedCapturePoints } from './fogDisplay';
import { ownerLabel, rankNames, rankStars, sideLabel, terrainNames, unitNames, unitWeaponName, weaponNames } from './labels';
import { uiText } from './strings';

export interface InspectorRow { label: string; value: string }
export interface TileInspection {
  position: Position;
  title: string;
  rows: InspectorRow[];
  /** Omitted when the tile holds no unit, or holds one the viewer cannot see. */
  unit?: { title: string; rows: InspectorRow[] };
  /** The viewer has no vision here, so unit details are withheld. */
  hidden: boolean;
}

const stars = (count: number): string => count === 0 ? 'なし' : '★'.repeat(count);
const range = (kind: UnitKind): string => {
  const [minimum, maximum] = unitStats[kind].range;
  return minimum === maximum ? `${minimum}` : `${minimum}〜${maximum}`;
};

/**
 * Everything a tile can tell the player, as data. Touch devices have no hover,
 * so this replaces the tooltip as the primary way to read the board — which is
 * also why it is the single source for both the panel and its accessible text.
 *
 * Terrain is public knowledge (the board already labels it under fog), but a
 * hidden tile's unit is withheld, and an enemy's fuel and ammunition are never
 * reported even when the unit itself is visible.
 */
export function inspectTile(
  state: GameState,
  position: Position,
  viewer: PlayerId,
  visible: ReadonlySet<string>,
  selectedUnitKind?: UnitKind,
  productionRule: ProductionRule = defaultProductionRule,
): TileInspection | undefined {
  const terrain = terrainAt(state.board, position);
  if (!terrain) return undefined;
  const property = isPropertyTerrainKind(terrain.kind);
  const title = `${terrainNames[terrain.kind]}${property ? `（${ownerLabel(terrain.owner, viewer)}）` : ''}`;
  const rows: InspectorRow[] = [{ label: '防御', value: stars(defenseStars(terrain)) }];
  if (terrain.kind === 'supplyDepot') rows.push({ label: '補給', value: '施設上と隣接1マスの自軍地上部隊。修理・収入・生産なし' });
  const capturePoints = observedCapturePoints(terrain, visible.has(`${position.x},${position.y}`));
  if (capturePoints !== undefined) rows.push({ label: '占領値', value: capturePointsLabel(capturePoints) });
  const producible = productionKindsForRule(productionRule, state.ruleVersion)[terrain.kind];
  if (producible?.length) rows.push({ label: '生産', value: producible.map(kind => unitNames[kind]).join('・') });
  if (selectedUnitKind) {
    const cost = movementCost(state.board, position, selectedUnitKind);
    rows.push({ label: '移動コスト', value: Number.isFinite(cost) ? `${cost}` : '進入不可' });
  }
  const inspection: TileInspection = { position, title, rows, hidden: !visible.has(`${position.x},${position.y}`) };
  const unit = state.units.find(candidate => isDeployedUnit(candidate)
    && candidate.position.x === position.x && candidate.position.y === position.y);
  if (!unit || inspection.hidden) return inspection;
  const stats = unitStats[unit.kind];
  if (state.fortifications?.some(site => site.owner === unit.owner && site.position.x === position.x && site.position.y === position.y) && isGroundUnit(unit.kind)) rows.push({ label: '陣地防御', value: '陣地の所有軍の地上部隊 防御★+1（合計上限★4）' });
  const unitRows: InspectorRow[] = [
    { label: '耐久', value: `${unit.hp} / 100` },
    { label: uiText.weapon, value: unitWeaponName(unit.kind) },
    { label: uiText.ammoCapacity, value: `${stats.ammo}` },
    { label: '攻撃', value: `${stats.attack}` },
    { label: '射程', value: range(unit.kind) },
    { label: '移動', value: `${stats.movement}` },
    { label: '視界', value: `${stats.vision}` },
  ];
  const secondary = weaponsForUnit(unit.kind, state)[1];
  if (secondary) {
    unitRows.push({ label: `${uiText.weapon} 2`, value: `${weaponNames[secondary.kind]} · 威力 ${secondary.attack} · 射程 ${secondary.range.join('〜')} · ${uiText.ammoCapacity} ${secondary.ammo}` });
    if (unit.owner === viewer) unitRows.push({ label: `${weaponNames[secondary.kind]} ${uiText.ammo}`, value: `${weaponAmmo(unit, 1)} / ${secondary.ammo}` });
  }
  if (usesModernRules(state)) {
    const rank = experienceRank(unit.experience);
    unitRows.push({ label: '階級', value: `${rank ? `${rankStars(rank)} ` : ''}${rankNames[rank]}（経験 ${unit.experience ?? 0} / ${MAX_EXPERIENCE}）` });
  }
  const cargo = state.units.find(candidate => candidate.embarkedIn === unit.id);
  if (cargo) unitRows.push({ label: '搭載', value: unitNames[cargo.kind] });
  if (unit.owner === viewer) {
    unitRows.push({ label: '燃料', value: stats.fuelPerTurn === 0 ? '消費なし' : `${unit.fuel ?? stats.fuel}（毎手番 -${stats.fuelPerTurn}）` });
    const ammo = remainingAmmo(unit);
    unitRows.push({ label: uiText.ammo, value: stats.ammo === 0 ? uiText.unarmed : `${ammo} / ${stats.ammo}${ammo === 0 ? `（${uiText.ammoEmpty}）` : ''}` });
    const facilities = (['city', 'factory', 'capital', 'airport', 'port'] as const)
      .filter(kind => !usesModernRules(state) || canServiceUnitAt(kind, unit.kind)).map(kind => terrainNames[kind]).join('・');
    unitRows.push({ label: uiText.resupply, value: uiText.resupplyAt(facilities) + (usesModernRules(state) && isGroundUnit(unit.kind) ? uiText.resupplyByApc : '') });
    unitRows.push({ label: '状態', value: unit.hasActed ? '行動済み' : unit.hasMoved ? '移動済み' : '未行動' });
  }
  return { ...inspection, unit: { title: `${sideLabel(unit.owner, viewer)}の${unitNames[unit.kind]}`, rows: unitRows } };
}

/** Flat text of an inspection, used for the panel's accessible live region. */
export function describeTileInspection(inspection: TileInspection): string {
  const parts = [
    `(${inspection.position.x + 1}, ${inspection.position.y + 1}) ${inspection.title}`,
    ...inspection.rows.map(row => `${row.label} ${row.value}`),
  ];
  if (inspection.unit) parts.push(inspection.unit.title, ...inspection.unit.rows.map(row => `${row.label} ${row.value}`));
  else if (inspection.hidden) parts.push('未索敵');
  return parts.join('、');
}
