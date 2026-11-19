import { observeFourArmy, type FourArmyState } from '../game/fourArmyEngine';
import type { FourArmyExperienceView } from '../game/fourArmyExperience';
import type { FourArmyId } from '../game/fourArmyFoundation';
import type { CombatSummary } from '../game/combatSummary';

/** A scene must not disclose a participant that neither restricted observation knows. */
export function fourArmyBattleIsVisible(scene: CombatSummary<FourArmyId>, before: FourArmyState, after: FourArmyState, view: FourArmyExperienceView): boolean {
  if (view === 'all') return true;
  const observations = [observeFourArmy(before, view), observeFourArmy(after, view)].flatMap((o) => (o.ok ? [o.value] : []));
  return [scene.attacker, scene.defender].every((p) =>
    observations.some((o) => o.units.some((u) => u.id === p.unitId && u.position && (u.owner === view || (u.position.x === p.position.x && u.position.y === p.position.y)))),
  );
}

export { FourArmyTacticalScene as FourArmyBattleScene } from './fourArmyTacticalScene';
