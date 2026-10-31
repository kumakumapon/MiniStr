/** Evaluation-only rules. The shipped game does not import this module. */
import { damageRange, combatDamageFactor, selectCombatWeapon, type CombatForecast } from '../src/game/combat';
import { unitDefenseStars } from '../src/game/engineering';
import { visibleEnemies } from '../src/game/fog';
import { isGroundUnit } from '../src/game/logistics';
import { manhattanDistance, terrainAt } from '../src/game/terrain';
import { isDeployedUnit, type GameResult, type GameState, type Unit } from '../src/game/types';
import { unitCategory, type UnitWeapon } from '../src/game/units';

export const combatProfiles = ['classic', 'simultaneous', 'ambush', 'terrain', 'combined'] as const;
export type CombatProfile = (typeof combatProfiles)[number];

export function experimentalForecast(state: GameState, attacker: Unit, defender: Unit, base: GameResult<CombatForecast>, profile: CombatProfile): GameResult<CombatForecast> {
  if (!base.ok || profile === 'classic' || !isDeployedUnit(attacker) || !isDeployedUnit(defender)) return base;
  const attack = selectCombatWeapon(state, attacker, defender, base.value.attackWeapon);
  if (!attack.ok) return base;
  const simultaneous = (profile === 'simultaneous' || profile === 'combined') && !attack.value.weapon.indirect && manhattanDistance(attacker.position, defender.position) === 1;
  const surprise = (profile === 'ambush' || profile === 'combined') && !visibleEnemies(state, defender.owner).some((unit) => unit.id === attacker.id);
  const terrain = profile === 'terrain' || profile === 'combined';
  const expected = (from: Unit, to: Unit, weapon: UnitWeapon, hp: number, initiative = 1) => {
    const kind = to.position ? terrainAt(state.board, to.position)?.kind : undefined;
    const extra = terrain && isGroundUnit(to.kind) && (kind === 'plain' || kind === 'mountain') ? 1 : 0;
    const stars = unitDefenseStars(state, to) + extra;
    return Math.max(
      0,
      Math.round(((weapon.attack * hp) / 100) * weapon.effectiveness[unitCategory[to.kind]] * combatDamageFactor(state, from, to) * initiative * (1 - (stars * 0.1 * to.hp) / 100)),
    );
  };
  const damageToDefender = expected(attacker, defender, attack.value.weapon, attacker.hp, simultaneous ? 1.05 : 1);
  const outgoing = damageRange(damageToDefender);
  const counter = !attack.value.weapon.indirect && !surprise ? selectCombatWeapon(state, defender, attacker, undefined, true) : undefined;
  const counterAt = (hp: number) => (counter?.ok && (simultaneous || hp > 0) ? expected(defender, attacker, counter.value.weapon, simultaneous ? defender.hp : hp) : 0);
  const incoming = { min: damageRange(counterAt(Math.max(0, defender.hp - outgoing.max))).min, max: damageRange(counterAt(Math.max(0, defender.hp - outgoing.min))).max };
  return {
    ok: true,
    value: {
      attackWeapon: attack.value.slot,
      ...(counter?.ok ? { counterWeapon: counter.value.slot } : {}),
      damageToDefender,
      damageToAttacker: counterAt(Math.max(0, defender.hp - damageToDefender)),
      canCounter: !!counter?.ok && (simultaneous || defender.hp > damageToDefender),
      outgoing,
      incoming,
      possibleCounter: incoming.max > 0,
    },
  };
}
