import { productionKindsForRule } from '../game/facilities';
import { isObservedFourArmyCommand } from '../ai/fourArmyCpu';
import type { FourArmyObservation } from '../game/fourArmyEngine';
import type { Position } from '../game/types';
import { unitStats } from '../game/units';

/** The queue and end-turn confirmation use exactly the same deployed-unit set. */
export const fourArmyReadyUnits = (o: FourArmyObservation) => o.units.filter((u) => u.owner === o.viewer && u.position && !u.hasActed);

export function fourArmyProductionFacilities(o: FourArmyObservation): Position[] {
  return o.board.terrain.flatMap((row, y) =>
    row.flatMap((tile, x) =>
      tile.owner === o.viewer &&
      (productionKindsForRule('facility-v2', o.rules ? 14 : 12)[tile.kind]?.length ?? 0) > 0 &&
      !o.units.some((u) => u.position?.x === x && u.position.y === y)
        ? [{ x, y }]
        : [],
    ),
  );
}

export function fourArmyProductionOptions(o: FourArmyObservation, factory: Position) {
  const tile = o.board.terrain[factory.y]?.[factory.x];
  const full = o.units.filter((u) => u.owner === o.viewer).length >= (o.unitLimitPerArmy ?? 16);
  return (productionKindsForRule('facility-v2', o.rules ? 14 : 12)[tile?.kind ?? 'plain'] ?? []).map((kind) => ({
    kind,
    cost: unitStats[kind].cost,
    reason: full
      ? ('limit' as const)
      : o.player.gold < unitStats[kind].cost
        ? ('funds' as const)
        : !isObservedFourArmyCommand(o, { type: 'produce', actor: o.viewer, factory, kind })
          ? ('facility' as const)
          : undefined,
  }));
}
