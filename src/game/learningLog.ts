import type { GameCommand } from './session';
import { isEvacuationTarget } from './evacuation';
import { isDeployedUnit, type GameState, type PlayerId } from './types';
import { weaponAmmo } from './weapons';
import { unitStats } from './units';

export const learningActions = [
  'logistics',
  'repairReserve',
  'move',
  'attack',
  'capture',
  'endTurn',
  'produce',
  'embark',
  'disembark',
  'recon',
  'bridge',
  'evacuate',
  'resupply',
  'repair',
  'missionEmbark',
  'missionUnload',
  'missionEvacuate',
] as const;
export type LearningAction = (typeof learningActions)[number];
export type LearningProgress = Record<LearningAction, boolean>;
export const emptyLearningProgress = (): LearningProgress => Object.fromEntries(learningActions.map((action) => [action, false])) as LearningProgress;

/** Observes already-applied legal commands. Each side's progress is exposed separately. */
export class LearningLog {
  private progress = { red: emptyLearningProgress(), blue: emptyLearningProgress() };
  private cargo = { red: new Map<string, string>(), blue: new Map<string, string>() };

  observe(before: GameState, after: GameState, command: GameCommand): void {
    const player = before.activePlayer,
      progress = this.progress[player];
    if (
      command.type === 'logistics' ||
      command.type === 'repairReserve' ||
      command.type === 'move' ||
      command.type === 'attack' ||
      command.type === 'endTurn' ||
      command.type === 'produce' ||
      command.type === 'recon' ||
      command.type === 'bridge' ||
      command.type === 'evacuate'
    )
      progress[command.type] = true;
    if (command.type === 'capture') {
      const unit = before.units.find((unit) => unit.id === command.unitId);
      if (
        unit &&
        isDeployedUnit(unit) &&
        before.board.terrain[unit.position.y]![unit.position.x]!.owner !== player &&
        after.board.terrain[unit.position.y]![unit.position.x]!.owner === player
      )
        progress.capture = true;
    }
    if (command.type === 'embark') {
      progress.embark = true;
      if (isEvacuationTarget(before, command.unitId, player)) progress.missionEmbark = true;
      this.cargo[player].set(command.transportId, command.unitId);
    }
    if (command.type === 'disembark') {
      const id = this.cargo[player].get(command.transportId);
      if (id && after.units.some((unit) => unit.id === id && unit.owner === player && isDeployedUnit(unit))) {
        progress.disembark = true;
        if (isEvacuationTarget(before, id, player)) progress.missionUnload = true;
      }
      this.cargo[player].delete(command.transportId);
    }
    if (command.type === 'evacuate' && isEvacuationTarget(before, command.unitId, player)) progress.missionEvacuate = true;
    if (command.type === 'endTurn') {
      const recipient = after.activePlayer;
      const units = new Map(after.units.map((unit) => [unit.id, unit]));
      for (const unit of before.units) {
        const next = units.get(unit.id);
        if (unit.owner !== recipient || !next) continue;
        if (next.hp > unit.hp) this.progress[recipient].repair = true;
        if (
          (next.fuel ?? unitStats[next.kind].fuel) > (unit.fuel ?? unitStats[unit.kind].fuel) ||
          weaponAmmo(next, 0) > weaponAmmo(unit, 0) ||
          weaponAmmo(next, 1) > weaponAmmo(unit, 1)
        )
          this.progress[recipient].resupply = true;
      }
    }
    for (const side of ['red', 'blue'] as const)
      for (const transport of this.cargo[side].keys()) if (!after.units.some((unit) => unit.id === transport)) this.cargo[side].delete(transport);
  }

  snapshot(player: PlayerId): LearningProgress {
    return { ...this.progress[player] };
  }
}
