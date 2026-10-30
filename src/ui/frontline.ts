import {
  FORTIFICATION_COST,
  MAX_FORTIFICATIONS,
  fortificationError,
  isDeployedUnit,
  isGroundUnit,
  isServiceTile,
  isSupplyUnit,
  manhattanDistance,
  terrainAt,
  usesFrontlineRules,
  usesFiniteSupplyRules,
  SUPPLY_CAPACITY,
  supplyStock,
  stockCanSupply,
  usesModernRules,
  type GameState,
  type PlayerId,
  type Position,
  type Unit,
} from '../game';
import { escapeHtml } from './strings';
import { getLocale } from './locale';

/** Only friendly sources are read. The notice is conditional on the current position. */
export function supplyOutlook(state: GameState, unit: Unit): string {
  if (!usesFrontlineRules(state) || !isDeployedUnit(unit)) return '';
  const sources: string[] = [];
  if (isServiceTile(state, unit.position, unit.kind, unit.owner)) sources.push(getLocale() === 'en' ? 'compatible facility (paid HP repair)' : '対応施設（HP修理は有料）');
  if (isGroundUnit(unit.kind)) {
    if (state.board.terrain.some((row, y) => row.some((tile, x) => tile.kind === 'supplyDepot' && tile.owner === unit.owner && manhattanDistance(unit.position, { x, y }) <= 1)))
      sources.push(getLocale() === 'en' ? 'supply depot (no HP repair)' : '前線補給所（HP修理なし）');
    if (
      state.units.some(
        (source) =>
          source.owner === unit.owner &&
          source.id !== unit.id &&
          isDeployedUnit(source) &&
          isSupplyUnit(source.kind) &&
          (!usesFiniteSupplyRules(state) || (supplyStock(source) > 0 && (!stockCanSupply(state, SUPPLY_CAPACITY, unit) || stockCanSupply(state, supplyStock(source), unit)))) &&
          manhattanDistance(source.position, unit.position) === 1,
      )
    )
      sources.push(getLocale() === 'en' ? 'APC (no HP repair)' : 'APC（HP修理なし）');
  }
  const stockNote =
    usesFiniteSupplyRules(state) && unit.kind === 'apc'
      ? getLocale() === 'en'
        ? `Stock ${supplyStock(unit)} / ${SUPPLY_CAPACITY}. Replenished at owned compatible facilities or supply depots; APCs cannot transfer stock. `
        : `物資 ${supplyStock(unit)} / ${SUPPLY_CAPACITY}。自軍の対応施設・補給所で補充。APC同士で物資は移送しません。`
      : '';
  const limited = usesFiniteSupplyRules(state) && sources.length === 1 && sources[0]!.startsWith('APC');
  return (
    stockNote +
    (getLocale() === 'en'
      ? sources.length
        ? `Next friendly turn: ${limited ? 'partial fuel/ammo within available APC stock' : 'fuel/ammo'} from ${sources.join(' / ')} if position and sources remain.`
        : 'No resupply here next turn. Position and sources may change.'
      : sources.length
        ? `この位置と補給源が維持されれば、次の自軍手番開始時に${limited ? '物資の範囲で燃料・弾薬を補給予定' : '燃料・全武器の弾薬を補給予定'}：${sources.join('・')}。`
        : 'この位置では次の自軍手番の補給なし。位置と補給源の変化に注意。')
  );
}

/** Tiles serviced for the selected friendly kind; no hidden enemy participates. */
export function supplyRange(state: GameState, viewer: PlayerId, selectedId?: string): Set<string> {
  const unit = state.units.find((candidate) => candidate.id === selectedId && candidate.owner === viewer);
  const kind = unit?.kind ?? 'infantry';
  const suppliers = state.units.filter(
    (source) => source.owner === viewer && isDeployedUnit(source) && isSupplyUnit(source.kind) && (!usesFiniteSupplyRules(state) || supplyStock(source) > 0),
  );
  const depots = state.board.terrain.flatMap((row, y) => row.flatMap((tile, x) => (tile.kind === 'supplyDepot' && tile.owner === viewer ? [{ x, y }] : [])));
  const result = new Set<string>();
  for (let y = 0; y < state.board.height; y++)
    for (let x = 0; x < state.board.width; x++) {
      const p = { x, y };
      if (
        isServiceTile(state, p, kind, viewer) ||
        (usesModernRules(state) &&
          isGroundUnit(kind) &&
          ((usesFrontlineRules(state) && depots.some((source) => manhattanDistance(source, p) <= 1)) ||
            suppliers.some((source) => source.id !== unit?.id && isDeployedUnit(source) && manhattanDistance(source.position, p) === 1)))
      )
        result.add(`${x},${y}`);
    }
  return result;
}

export function renderFrontlineControls(state: GameState, viewer: PlayerId, selectedId: string | undefined, enabled: boolean, showRange: boolean, pending?: string): string {
  if (!usesFrontlineRules(state)) return '';
  const unit = state.units.find((candidate) => candidate.id === selectedId && candidate.owner === viewer);
  const english = getLocale() === 'en';
  const count = state.fortifications?.filter((site) => site.owner === viewer).length ?? 0;
  const error = unit?.kind === 'engineer' ? fortificationError(state, unit.id) : undefined;
  const confirmation = unit?.kind === 'engineer' && pending === unit.id;
  return `<section id="frontline-controls" class="frontline-controls" aria-label="${english ? 'Frontline supply and engineering' : '前線補給・設営'}">
    <button id="supply-range" class="save-action" aria-pressed="${showRange}">${english ? 'Supply coverage' : '補給範囲'}${showRange ? ' ON' : ' OFF'}</button>
    <span>${english ? 'Cover' : '陣地'} ${count} / ${MAX_FORTIFICATIONS} · ${english ? (unit ? 'Selected friendly kind' : 'Ground units') : unit ? '選択中の自軍兵科の補給範囲' : '地上部隊の補給範囲'}</span>
    ${unit?.kind === 'engineer' ? `<button id="${confirmation ? 'fortify-confirm' : 'fortify-unit'}" class="save-action" ${!enabled || error ? 'disabled' : ''}>${confirmation ? (english ? 'Confirm construction' : '設営を確定') : english ? 'Build cover' : '陣地を設営'} (${FORTIFICATION_COST}G)</button>${confirmation ? `<button id="fortify-cancel" class="save-action">${english ? 'Cancel' : '中止'}</button>` : ''}<small role="status">${escapeHtml(error ?? (english ? 'Ground defense +1 star. Construction ends this turn.' : '地上防御★+1。設営でこの部隊の行動終了。'))}</small>` : ''}
  </section>`;
}

export function fortificationAt(state: GameState, position: Position, visible: ReadonlySet<string>): string {
  if (!usesFrontlineRules(state) || !visible.has(`${position.x},${position.y}`) || terrainAt(state.board, position)?.kind !== 'plain') return '';
  const site = state.fortifications?.find((candidate) => candidate.position.x === position.x && candidate.position.y === position.y);
  return site ? `<span class="fortification-marker ${escapeHtml(site.owner)}" aria-hidden="true">陣</span>` : '';
}
