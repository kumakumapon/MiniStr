import { forecastCombat } from '../game/combat';
import { isServiceTile } from '../game/logistics';
import { hasUsableWeapon } from '../game/weapons';
import { isDeployedUnit, type DeployedUnit, type GameState, type Unit } from '../game/types';

/** Confirmed, immediately available follow-up shots; no unseen opponents or hypothetical moves. */
export function supportedAttack(state: GameState, attacker: DeployedUnit, target: Unit, defensive: boolean): boolean {
  if ((state.ruleVersion ?? 0) < 12) return false;
  const first = forecastCombat(state, attacker, target);
  if (!first.ok || first.value.outgoing.min <= 0 || first.value.incoming.max >= attacker.hp) return false;
  // A defensive unit can trade from its own repair facility instead of waiting
  // through repeated enemy attacks. Keep the expected exchange profitable.
  if (defensive && attacker.hp >= 50 && isServiceTile(state, attacker.position, attacker.kind, attacker.owner) && first.value.damageToDefender > first.value.damageToAttacker)
    return true;
  // Do not sacrifice a unit merely to set up a possible finishing shot.
  if (first.value.damageToDefender < first.value.damageToAttacker) return false;
  let damage = first.value.outgoing.min;
  for (const ally of state.units) {
    if (ally.id === attacker.id || ally.owner !== attacker.owner || !isDeployedUnit(ally) || ally.hasActed || !hasUsableWeapon(state, ally)) continue;
    const shot = forecastCombat(state, ally, target);
    if (!shot.ok || shot.value.incoming.max >= ally.hp) continue;
    damage += shot.value.outgoing.min;
    if (damage >= target.hp) return true;
  }
  return false;
}
