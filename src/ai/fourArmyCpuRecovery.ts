import { alliedArmies } from '../game/smallBattle';
import type { FourArmyObservation } from '../game/fourArmyEngine';
import { smallBattleFocus } from './fourArmyCpuOrder';
import type { GameState, Position, Unit, UnitKind } from '../game/types';
import { unitDefinitions, unitStats } from '../game/units';
import { weaponAmmo, weaponsForUnit } from '../game/weapons';
import { manhattanDistance, positionKey, terrainAt, unitMovementCost } from '../game/terrain';
import { isPropertyTerrainKind } from '../game/facilities';
import { crossingDistances } from './crossing';

/** Own resources and observed enemies only; callers keep v1–v6 decisions pinned. */
export const needsFourArmyRecovery = (view: GameState, unit: Unit): boolean => unit.hp < 45 || (!!weaponsForUnit(unit.kind, view)[0]?.ammo && weaponAmmo(unit, 0) === 0);
export const healthyFourArmyCapturers = (own: readonly Unit[]): number =>
  own.filter((unit) => unitStats[unit.kind].capturePower > 0 && unit.hp >= 50 && (unit.fuel ?? unitStats[unit.kind].fuel) >= unitStats[unit.kind].movement).length;

/** Keep indirect weapons in range, and leave capturable facilities free for nearby own infantry. */
export function fourArmySupportTargets(view: GameState, unit: Unit, targets: readonly Position[], own: readonly Unit[]): Position[] {
  const weapon = weaponsForUnit(unit.kind, view)[0];
  const positions: Position[] = [];
  for (const target of targets) {
    const tile = terrainAt(view.board, target);
    const leaveForCapturer =
      unitStats[unit.kind].capturePower === 0 &&
      tile &&
      isPropertyTerrainKind(tile.kind) &&
      tile.owner !== 'red' &&
      own.some((ally) => ally.position && unitStats[ally.kind].capturePower > 0 && manhattanDistance(ally.position, target) <= unitStats[ally.kind].movement * 2);
    const range = weapon?.indirect ? weapon.range : leaveForCapturer ? ([1, 1] as const) : undefined;
    if (!range) {
      positions.push(target);
      continue;
    }
    for (let dy = -range[1]; dy <= range[1]; dy++)
      for (let dx = -range[1]; dx <= range[1]; dx++) {
        const d = Math.abs(dx) + Math.abs(dy),
          p = { x: target.x + dx, y: target.y + dy };
        if (d < range[0] || d > range[1] || !Number.isFinite(unitMovementCost(view, p, unit.kind))) continue;
        if (view.units.some((other) => other.id !== unit.id && other.position?.x === p.x && other.position.y === p.y)) continue;
        positions.push(p);
      }
  }
  return [...new Map(positions.map((p) => [positionKey(p), p])).values()];
}

/** A bounded counter to observed armour avoids replenishing only tanks in long front lines. */
export function fourArmyCounterProduction(kind: UnitKind, own: readonly Unit[], enemies: readonly Unit[]): number {
  const armour = enemies.filter((unit) => unitDefinitions[unit.kind].category === 'armor').length;
  return kind === 'artillery' && armour >= 2 && !own.some((unit) => unitStats[unit.kind].indirect && unit.hp >= 45) ? 160 : 0;
}

/** Spend on a crossing only if it shortens a known route for an own capture unit. */
export function fourArmyBridgeBenefit(view: GameState, destination: Position, own: readonly Unit[], goals: readonly Position[]): number {
  const projected = { ...view, bridges: [...(view.bridges ?? []), { owner: 'red' as const, position: destination }] };
  return own
    .filter((unit) => unit.position && unitStats[unit.kind].capturePower > 0)
    .reduce((sum, unit) => {
      const before = crossingDistances(view, unit.kind, goals).get(positionKey(unit.position!)) ?? Infinity;
      const after = crossingDistances(projected, unit.kind, goals).get(positionKey(unit.position!)) ?? Infinity;
      return sum + (Number.isFinite(after) ? Math.max(0, Math.min(20, before - after)) : 0);
    }, 0);
}

/** Three-way FFA gives each start one strategic opponent; team members never focus an ally. */
export function fourArmyPressureFocus(o: FourArmyObservation) {
  const cyclic = smallBattleFocus(o);
  if (!cyclic) return;
  const enemies = o.alive.filter((a) => !alliedArmies(o.match, a, o.viewer));
  return enemies.includes(cyclic) ? cyclic : enemies[0];
}
