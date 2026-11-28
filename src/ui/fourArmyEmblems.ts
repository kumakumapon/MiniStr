import type { FourArmyId } from '../game/fourArmyFoundation';

export const armyShapes: Record<FourArmyId, string> = { army1: '■', army2: '●', army3: '◆', army4: '▲' };

export function armyEmblem(army: FourArmyId): string {
  return `<span class="army-emblem ${army}" aria-hidden="true">${armyShapes[army]}</span>`;
}
