import { reachablePositionsForPlayer } from '../game/commands';
import { isEvacuationTarget } from '../game/evacuation';
import { fixedSupplyAvailable, isGroundUnit } from '../game/logistics';
import { SUPPLY_CAPACITY, stockCanSupply, supplyFromStock, supplyStock } from '../game/supplyStock';
import { manhattanDistance } from '../game/terrain';
import { STRATEGY_RULE_VERSION, type DeployedUnit, type GameState, type PlayerId, type Position } from '../game/types';
import { remainingAmmo, unitStats } from '../game/units';
import type { CpuAction } from './rules';

/** Coordinate a turn-start delivery instead of letting the recipient and truck chase each other. */
export function supplyRendezvous(
  state: GameState,
  player: PlayerId,
  units: readonly DeployedUnit[],
  score: (truck: DeployedUnit, position: Position) => number,
): CpuAction | undefined {
  if ((state.ruleVersion ?? 0) < STRATEGY_RULE_VERSION) return undefined;
  const needy = units.filter(
    (unit) =>
      isGroundUnit(unit.kind) &&
      unit.kind !== 'apc' &&
      !isEvacuationTarget(state, unit.id, player) &&
      !fixedSupplyAvailable(state, unit.position, unit.kind, player) &&
      ((unitStats[unit.kind].ammo > 0 && remainingAmmo(unit) <= 1) || (unit.fuel ?? unitStats[unit.kind].fuel) <= 6),
  );
  if (!needy.length) return undefined;
  const trucks = units.filter(
    (unit) =>
      unit.kind === 'apc' && supplyStock(unit) > SUPPLY_CAPACITY / 3 && !isEvacuationTarget(state, unit.id, player) && !state.units.some((cargo) => cargo.embarkedIn === unit.id),
  );
  // Turn-start stock is allocated in stable ID order, including non-critical
  // neighbours. A nominally adjacent truck may run dry before this recipient.
  const recipients = [...units].filter((unit) => isGroundUnit(unit.kind)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const delivery = (truck: DeployedUnit, position: Position, recipient?: DeployedUnit): number => {
    let stock = supplyStock(truck),
      value = 0;
    for (const unit of recipients) {
      if (unit.id === truck.id || manhattanDistance(unit.position, position) !== 1 || fixedSupplyAvailable(state, unit.position, unit.kind, player)) continue;
      const supplied = supplyFromStock(state, unit, stock);
      stock -= supplied.spent;
      if (!needy.includes(unit) || (recipient && unit.id !== recipient.id)) continue;
      const ammo = remainingAmmo(supplied.unit) - remainingAmmo(unit);
      const fuel = (supplied.unit.fuel ?? unitStats[unit.kind].fuel) - (unit.fuel ?? unitStats[unit.kind].fuel);
      // Restoring a primary shot or mobility takes precedence over topping up.
      value += Math.min(3, ammo) * 12 + (fuel > 0 ? 12 : 0);
    }
    return value;
  };
  // Once the provider has committed its berth, do not send a dry unit away.
  const waiting = needy.find(
    (unit) =>
      !unit.hasActed &&
      trucks.some(
        (truck) =>
          (truck.hasMoved || truck.hasActed) &&
          manhattanDistance(unit.position, truck.position) === 1 &&
          delivery(truck, truck.position, unit) > 0 &&
          Number.isFinite(score(truck, truck.position)),
      ),
  );
  if (waiting) return { type: 'wait', unitId: waiting.id };
  for (const truck of trucks) {
    if (truck.hasActed) continue;
    const destinations = truck.hasMoved ? [truck.position] : [truck.position, ...reachablePositionsForPlayer(state, truck.id, player)];
    const best = destinations
      .filter((position) => needy.some((unit) => manhattanDistance(unit.position, position) === 1 && stockCanSupply(state, supplyStock(truck), unit)))
      .map((position) => ({ position, delivery: delivery(truck, position), value: score(truck, position) }))
      .filter((candidate) => candidate.delivery > 0)
      .map((candidate) => ({ ...candidate, value: candidate.value + candidate.delivery }))
      .filter((candidate) => Number.isFinite(candidate.value))
      .sort(
        (a, b) =>
          b.value - a.value ||
          manhattanDistance(truck.position, a.position) - manhattanDistance(truck.position, b.position) ||
          a.position.y - b.position.y ||
          a.position.x - b.position.x,
      )[0];
    if (best) return manhattanDistance(truck.position, best.position) === 0 ? { type: 'wait', unitId: truck.id } : { type: 'move', unitId: truck.id, destination: best.position };
  }
  return undefined;
}
