import { isObservedFourArmyCommand } from '../ai/fourArmyCpu';
import { fourArmyPlanningView } from '../ai/fourArmyObservation';
import { reachablePositionsForPlayer } from '../game/commands';
import { forecastCombat } from '../game/combat';
import { productionKindsForRule } from '../game/facilities';
import type { FourArmyCommand, FourArmyObservation } from '../game/fourArmyEngine';
import type { Position } from '../game/types';

export type FourArmyHumanAction = 'move' | 'attack-primary' | 'attack-secondary' | 'merge' | 'embark' | 'disembark' | 'wait' | 'capture' | 'produce' | 'endTurn';
export interface FourArmyHumanChoice {
  action: FourArmyHumanAction;
  command: FourArmyCommand;
  target?: Position;
  damage?: { min: number; max: number };
  counterDamage?: { min: number; max: number };
}
/** Every highlight and forecast comes from the same sanitized observation as the CPU. */
export function fourArmyHumanChoices(o: FourArmyObservation, selected: Position): FourArmyHumanChoice[] {
  const actor = o.viewer,
    view = fourArmyPlanningView(o),
    choices: FourArmyHumanChoice[] = [];
  const add = (action: FourArmyHumanAction, command: FourArmyCommand, target?: Position, damage?: { min: number; max: number }, counterDamage?: { min: number; max: number }) => {
    if (isObservedFourArmyCommand(o, command))
      choices.push({ action, command, ...(target ? { target } : {}), ...(damage ? { damage } : {}), ...(counterDamage ? { counterDamage } : {}) });
  };
  add('endTurn', { actor, type: 'endTurn' });
  const unit = view.units.find((u) => u.owner === 'red' && u.position?.x === selected.x && u.position.y === selected.y);
  if (unit) {
    for (const destination of reachablePositionsForPlayer(view, unit.id, 'red')) add('move', { actor, type: 'move', unitId: unit.id, destination }, destination);
    add('wait', { actor, type: 'wait', unitId: unit.id });
    add('capture', { actor, type: 'capture', unitId: unit.id });
    for (const target of view.units) {
      if (!target.position || target.id === unit.id) continue;
      if (target.owner === 'blue') {
        for (const weaponSlot of [0, 1] as const) {
          const forecast = forecastCombat(view, unit, target, weaponSlot);
          if (forecast.ok)
            add(
              weaponSlot === 0 ? 'attack-primary' : 'attack-secondary',
              { actor, type: 'attack', unitId: unit.id, targetId: target.id, weaponSlot },
              target.position,
              forecast.value.outgoing,
              forecast.value.incoming,
            );
        }
      } else {
        add('merge', { actor, type: 'merge', unitId: unit.id, targetId: target.id }, target.position);
        add('embark', { actor, type: 'embark', unitId: unit.id, transportId: target.id }, target.position);
      }
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const destination = { x: selected.x + dx!, y: selected.y + dy! };
      add('disembark', { actor, type: 'disembark', transportId: unit.id, destination }, destination);
    }
  }
  const tile = view.board.terrain[selected.y]?.[selected.x];
  for (const kind of productionKindsForRule('facility-v2', 12)[tile?.kind ?? 'plain'] ?? []) add('produce', { actor, type: 'produce', factory: selected, kind });
  return choices;
}
