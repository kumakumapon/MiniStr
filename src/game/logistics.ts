import { rearmUnit } from './weapons';
import { isPropertyTerrainKind } from './facilities';
import { manhattanDistance, terrainAt } from './terrain';
import { isDeployedUnit, usesFiniteSupplyRules, usesFrontlineRules, usesModernRules, type GameState, type PlayerId, type Position, type TerrainKind, type Unit, type UnitKind } from './types';
import { SUPPLY_CAPACITY, supplyFromStock, supplyStock } from './supplyStock';
import { isSupplyUnit, unitDefinitions, unitStats, type MovementProfile } from './units';

/** HP a unit on a compatible owned facility recovers at the start of its turn. */
export const REPAIR_HP_PER_TURN = 20;
/** When funds run short, repairs are rounded down to this many HP. */
export const REPAIR_HP_STEP = 10;

/**
 * Modern rules: ground units are serviced at cities, factories, and capitals,
 * aircraft only at airports, and ships only at ports.
 */
const serviceTerrainByProfile: Record<MovementProfile, ReadonlySet<TerrainKind>> = {
  foot: new Set(['city', 'factory', 'capital']),
  vehicle: new Set(['city', 'factory', 'capital']),
  air: new Set(['airport']),
  sea: new Set(['port']),
};

export function canServiceUnitAt(terrain: TerrainKind, kind: UnitKind): boolean {
  return serviceTerrainByProfile[unitDefinitions[kind].movementProfile].has(terrain);
}

export function isGroundUnit(kind: UnitKind): boolean {
  const profile = unitDefinitions[kind].movementProfile;
  return profile === 'foot' || profile === 'vehicle';
}

/**
 * Whether `unit` would be refuelled on `position` at the start of its owner's
 * turn. Classic rules service every unit on any owned property.
 */
const depotCache = new WeakMap<GameState['board'], { position: Position; owner?: PlayerId }[]>();
export function depotPositions(state: GameState): readonly { position: Position; owner?: PlayerId }[] {
  let positions = depotCache.get(state.board);
  if (!positions) {
    positions = state.board.terrain.flatMap((row, y) => row.flatMap((tile, x) => tile.kind === 'supplyDepot' ? [{ position: { x, y }, owner: tile.owner }] : []));
    depotCache.set(state.board, positions);
  }
  return positions;
}
export function suppliedByDepot(state: GameState, position: Position, owner: PlayerId): boolean {
  return usesFrontlineRules(state) && depotPositions(state).some(source => source.owner === owner && manhattanDistance(position, source.position) <= 1);
}

export function resupplyAvailable(state: GameState, position: Position, kind: UnitKind, owner: PlayerId, excludeId?: string): boolean {
  return isServiceTile(state, position, kind, owner) || usesModernRules(state) && isGroundUnit(kind)
    && (suppliedByDepot(state, position, owner) || adjacentToSupplyUnit(state, position, owner, excludeId));
}

/** Only these sources can refill an APC's stock; APCs cannot refill each other. */
export function fixedSupplyAvailable(state: GameState, position: Position, kind: UnitKind, owner: PlayerId): boolean {
  return isServiceTile(state, position, kind, owner) || isGroundUnit(kind) && suppliedByDepot(state, position, owner);
}

export function isServiceTile(state: GameState, position: Position, kind: UnitKind, owner: PlayerId): boolean {
  const terrain = terrainAt(state.board, position);
  if (!terrain || terrain.owner !== owner || !isPropertyTerrainKind(terrain.kind) || terrain.kind === 'supplyDepot') return false;
  return !usesModernRules(state) || canServiceUnitAt(terrain.kind, kind);
}

/** Funds needed to restore `hp` hit points: 1% of the unit's price per HP. */
export function repairCost(kind: UnitKind, hp: number): number {
  return unitStats[kind].cost / 100 * hp;
}

/** HP actually repaired given available funds, rounded down to whole repair steps when short. */
export function affordableRepair(kind: UnitKind, missingHp: number, gold: number): number {
  const wanted = Math.min(REPAIR_HP_PER_TURN, Math.max(0, missingHp));
  if (repairCost(kind, wanted) <= gold) return wanted;
  const perStep = repairCost(kind, REPAIR_HP_STEP);
  return Math.min(wanted, Math.floor(gold / perStep) * REPAIR_HP_STEP);
}

/** Whether a deployed allied supply unit is adjacent to `position`. */
export function adjacentToSupplyUnit(state: GameState, position: Position, owner: PlayerId, excludeId?: string): boolean {
  return state.units.some(unit => unit.owner === owner && unit.id !== excludeId && isDeployedUnit(unit)
    && isSupplyUnit(unit.kind) && (!usesFiniteSupplyRules(state) || supplyStock(unit) > 0) && manhattanDistance(unit.position, position) === 1);
}

const withFullSupplies = (unit: Unit, state: GameState): Unit => ({ ...rearmUnit(unit, state), fuel: unitStats[unit.kind].fuel });

function finiteResupply(state: GameState, player: PlayerId, consumed: Unit[]): Unit[] {
  const fixed = (unit: Unit): boolean => {
    if (unit.owner !== player) return false;
    if (isDeployedUnit(unit)) return fixedSupplyAvailable(state, unit.position, unit.kind, player);
    const transport = consumed.find(candidate => candidate.id === unit.embarkedIn);
    return isGroundUnit(unit.kind) && !!transport && isDeployedUnit(transport) && isGroundUnit(transport.kind) && suppliedByDepot(state, transport.position, player);
  };
  const supplied = consumed.map(unit => {
    if (!fixed(unit)) return unit;
    return { ...withFullSupplies(unit, state), ...(unit.kind === 'apc' ? { supplyStock: SUPPLY_CAPACITY } : {}) };
  });
  const compareIds = (left: Unit, right: Unit): number => left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  const providers = supplied.filter(unit => unit.owner === player && isDeployedUnit(unit) && isSupplyUnit(unit.kind)).sort(compareIds);
  const stocks = new Map(providers.map(unit => [unit.id, supplyStock(unit)]));
  const received = new Map<string, Unit>();
  // Cargo gets priority. Stable IDs make allocation independent of array order.
  const recipients = supplied.filter(unit => unit.owner === player && isGroundUnit(unit.kind) && !fixed(unit))
    .sort((left, right) => Number(left.embarkedIn === undefined) - Number(right.embarkedIn === undefined) || compareIds(left, right));
  for (const recipient of recipients) {
    let next = recipient;
    for (const provider of providers) {
      if (provider.id === recipient.id || !isDeployedUnit(provider)) continue;
      if (recipient.embarkedIn !== provider.id && (!isDeployedUnit(recipient) || manhattanDistance(recipient.position, provider.position) !== 1)) continue;
      const delivered = supplyFromStock(state, next, stocks.get(provider.id)!);
      stocks.set(provider.id, stocks.get(provider.id)! - delivered.spent);
      next = delivered.unit;
    }
    received.set(next.id, next);
  }
  return supplied.map(unit => ({ ...(received.get(unit.id) ?? unit), ...(stocks.has(unit.id) ? { supplyStock: stocks.get(unit.id)! } : {}) }));
}

/**
 * Modern turn-start upkeep for `player`, applied after income has been collected:
 * fuel consumption away from compatible facilities, supply-vehicle resupply of
 * adjacent ground units and their own cargo, then paid repairs in unit order.
 * Destroying aircraft and ships that ran dry is left to the caller.
 */
export function applyModernUpkeep(state: GameState, player: PlayerId, consumeFuel = true): GameState {
  const consumed = state.units.map(unit => {
    if (unit.owner !== player || !isDeployedUnit(unit) || isServiceTile(state, unit.position, unit.kind, player)) return unit;
    const stats = unitStats[unit.kind];
    return consumeFuel && stats.fuelPerTurn > 0 ? { ...unit, fuel: Math.max(0, (unit.fuel ?? stats.fuel) - stats.fuelPerTurn) } : unit;
  });
  const suppliers = new Set(consumed.filter(unit => unit.owner === player && isDeployedUnit(unit) && isSupplyUnit(unit.kind)).map(unit => unit.id));
  const supplied = usesFiniteSupplyRules(state) ? finiteResupply(state, player, consumed) : consumed.map(unit => {
    if (unit.owner !== player || !isGroundUnit(unit.kind)) return unit;
    if (unit.embarkedIn !== undefined) {
      const transport = consumed.find(candidate => candidate.id === unit.embarkedIn);
      return suppliers.has(unit.embarkedIn) || transport && isDeployedUnit(transport) && isGroundUnit(transport.kind) && suppliedByDepot(state, transport.position, player) ? withFullSupplies(unit, state) : unit;
    }
    return isDeployedUnit(unit) && (suppliedByDepot(state, unit.position, player) || adjacentToSupplyUnit({ ...state, units: consumed }, unit.position, player, unit.id)) ? withFullSupplies(unit, state) : unit;
  });
  let gold = state.players[player].gold;
  const repaired = supplied.map(unit => {
    if (unit.owner !== player || !isDeployedUnit(unit) || !isServiceTile(state, unit.position, unit.kind, player)) return unit;
    const hp = affordableRepair(unit.kind, 100 - unit.hp, gold);
    gold -= repairCost(unit.kind, hp);
    return { ...withFullSupplies(unit, state), hp: unit.hp + hp };
  });
  return { ...state, units: repaired, players: { ...state.players, [player]: { ...state.players[player], gold } } };
}

export interface RepairSummary { units: number; hp: number; cost: number }

/** Repairs `player` received between two consecutive states, for the player's own turn log only. */
export function summarizeRepairs(before: GameState, after: GameState, player: PlayerId): RepairSummary {
  const summary: RepairSummary = { units: 0, hp: 0, cost: 0 };
  for (const unit of after.units) {
    if (unit.owner !== player) continue;
    const previous = before.units.find(candidate => candidate.id === unit.id);
    if (!previous || unit.hp <= previous.hp) continue;
    const hp = unit.hp - previous.hp;
    summary.units += 1;
    summary.hp += hp;
    if (usesModernRules(after)) summary.cost += repairCost(unit.kind, hp);
  }
  return summary;
}
