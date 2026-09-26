import { isPropertyTerrainKind } from './facilities';
import { manhattanDistance, terrainAt } from './terrain';
import { isDeployedUnit, usesModernRules, type GameState, type PlayerId, type Position, type TerrainKind, type Unit, type UnitKind } from './types';
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
export function isServiceTile(state: GameState, position: Position, kind: UnitKind, owner: PlayerId): boolean {
  const terrain = terrainAt(state.board, position);
  if (!terrain || terrain.owner !== owner || !isPropertyTerrainKind(terrain.kind)) return false;
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
    && isSupplyUnit(unit.kind) && manhattanDistance(unit.position, position) === 1);
}

const withFullSupplies = (unit: Unit): Unit => ({ ...unit, fuel: unitStats[unit.kind].fuel, ammo: unitStats[unit.kind].ammo });

/**
 * Modern turn-start upkeep for `player`, applied after income has been collected:
 * fuel consumption away from compatible facilities, supply-vehicle resupply of
 * adjacent ground units and their own cargo, then paid repairs in unit order.
 * Destroying aircraft and ships that ran dry is left to the caller.
 */
export function applyModernUpkeep(state: GameState, player: PlayerId): GameState {
  const consumed = state.units.map(unit => {
    if (unit.owner !== player || !isDeployedUnit(unit) || isServiceTile(state, unit.position, unit.kind, player)) return unit;
    const stats = unitStats[unit.kind];
    return stats.fuelPerTurn > 0 ? { ...unit, fuel: Math.max(0, (unit.fuel ?? stats.fuel) - stats.fuelPerTurn) } : unit;
  });
  const suppliers = new Set(consumed.filter(unit => unit.owner === player && isDeployedUnit(unit) && isSupplyUnit(unit.kind)).map(unit => unit.id));
  const supplied = consumed.map(unit => {
    if (unit.owner !== player || !isGroundUnit(unit.kind)) return unit;
    if (unit.embarkedIn !== undefined) return suppliers.has(unit.embarkedIn) ? withFullSupplies(unit) : unit;
    return isDeployedUnit(unit) && adjacentToSupplyUnit({ ...state, units: consumed }, unit.position, player, unit.id) ? withFullSupplies(unit) : unit;
  });
  let gold = state.players[player].gold;
  const repaired = supplied.map(unit => {
    if (unit.owner !== player || !isDeployedUnit(unit) || !isServiceTile(state, unit.position, unit.kind, player)) return unit;
    const hp = affordableRepair(unit.kind, 100 - unit.hp, gold);
    gold -= repairCost(unit.kind, hp);
    return { ...withFullSupplies(unit), hp: unit.hp + hp };
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
