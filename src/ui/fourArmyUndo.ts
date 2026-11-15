import { fourArmyHumanArmies, type FourArmyControllers } from '../game/fourArmyControl';
import { observeFourArmy, type FourArmyState, type FourArmyCommand } from '../game/fourArmyEngine';
import type { FourArmyExperience } from '../game/fourArmyExperience';

export interface FourArmyUndoEntry {
  position: number;
  state: FourArmyState;
  experience: FourArmyExperience;
}
/** A single human may rewind reversible own-turn actions, never a revealed outcome or a CPU turn. */
export function canUndoFourArmyCommand(before: FourArmyState, command: FourArmyCommand, after: FourArmyState, controllers: FourArmyControllers): boolean {
  const humans = fourArmyHumanArmies(controllers);
  if (humans.length !== 1 || humans[0] !== command.actor || before.outcome.type !== 'ongoing' || after.outcome.type !== 'ongoing' || before.paused || after.paused) return false;
  if (
    ['attack', 'recon', 'endTurn', 'resume'].includes(command.type) ||
    before.rngSeed !== after.rngSeed ||
    JSON.stringify(before.round) !== JSON.stringify(after.round) ||
    before.alive.join() !== after.alive.join()
  )
    return false;
  if (command.type === 'move') {
    const u = after.units.find((u) => u.id === command.unitId);
    if (u?.position?.x !== command.destination.x || u.position.y !== command.destination.y) return false;
  }
  if (command.type !== 'merge' && before.units.some((u) => u.owner === command.actor && after.units.find((n) => n.id === u.id)?.hp !== u.hp)) return false;
  const a = observeFourArmy(before, command.actor),
    b = observeFourArmy(after, command.actor);
  if (!a.ok || !b.ok) return false;
  const visible = new Set(a.value.visible.map((p) => `${p.x},${p.y}`));
  if (b.value.visible.some((p) => !visible.has(`${p.x},${p.y}`))) return false;
  for (const u of b.value.units.filter((u) => u.owner !== command.actor)) {
    const previous = a.value.units.find((old) => old.id === u.id);
    if (!previous || previous.kind !== u.kind || previous.hp !== u.hp || previous.position?.x !== u.position?.x || previous.position?.y !== u.position?.y) return false;
  }
  return true;
}
export class FourArmyUndoHistory {
  static readonly LIMIT = 8;
  private entries: FourArmyUndoEntry[] = [];
  get length(): number {
    return this.entries.length;
  }
  push(entry: FourArmyUndoEntry): void {
    this.entries.push(structuredClone(entry));
    if (this.entries.length > FourArmyUndoHistory.LIMIT) this.entries.shift();
  }
  pop(): FourArmyUndoEntry | undefined {
    return this.entries.pop();
  }
  clear(): void {
    this.entries = [];
  }
}
