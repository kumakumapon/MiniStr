import type { WeaponKind } from './units';
import type { GameCommand } from './session';
import { forecastCombat } from './combat';
import { isDeployedUnit, type GameState, type PlayerId, type Position, type TerrainKind, type UnitKind } from './types';
import { weaponsForUnit } from './weapons';

export interface CombatParticipant<Owner extends string = PlayerId> {
  unitId?: string;
  kind: UnitKind;
  owner: Owner;
  position: Position;
  weapon?: WeaponKind;
  hpBefore: number;
  hpAfter: number;
}

export interface CombatSummary<Owner extends string = PlayerId> {
  simultaneous?: true;
  ambush?: true;
  counterFired?: true;
  attacker: CombatParticipant<Owner>;
  defender: CombatParticipant<Owner>;
  terrain: TerrainKind;
}

/** Creates a visual summary from resolved combat, leaving all game rules untouched. */
export function combatSummaryForCommand(before: GameState, command: GameCommand, after: GameState): CombatSummary | undefined {
  const event = after.tactics?.lastCombat;
  if (command.type !== 'attack') {
    if (!event?.ambush || command.type !== 'move') return undefined;
    command = { type: 'attack', unitId: event.attackerId, targetId: event.defenderId, weaponSlot: event.attackWeapon };
  }
  const originalAttacker = before.units.find((unit) => unit.id === command.unitId);
  const originalDefender = before.units.find((unit) => unit.id === command.targetId);
  if (!originalAttacker || !isDeployedUnit(originalAttacker) || !originalDefender || !isDeployedUnit(originalDefender)) return undefined;
  const attackerBefore = event ? { ...originalAttacker, position: event.attackerPosition } : originalAttacker;
  const defenderBefore = event ? { ...originalDefender, position: event.defenderPosition } : originalDefender;

  const attackerAfter = after.units.find((unit) => unit.id === command.unitId);
  const defenderAfter = after.units.find((unit) => unit.id === command.targetId);
  const terrain = before.board.terrain[defenderBefore.position.y]?.[defenderBefore.position.x];
  if (!terrain) return undefined;

  const forecast = forecastCombat(before, attackerBefore, defenderBefore, command.weaponSlot, event?.ambush);
  const attackingWeapon = forecast.ok ? weaponsForUnit(attackerBefore.kind, before)[forecast.value.attackWeapon]?.kind : undefined;
  const counterWeapon =
    (defenderAfter || event?.simultaneous) && !event?.ambush && forecast.ok && forecast.value.counterWeapon !== undefined
      ? weaponsForUnit(defenderBefore.kind, before)[forecast.value.counterWeapon]?.kind
      : undefined;
  return {
    ...(event?.simultaneous ? { simultaneous: true as const } : {}),
    ...(event?.ambush ? { ambush: true as const } : {}),
    ...(event?.counterWeapon !== undefined ? { counterFired: true as const } : {}),
    attacker: {
      kind: attackerBefore.kind,
      weapon: attackingWeapon,
      owner: attackerBefore.owner,
      position: { ...attackerBefore.position },
      hpBefore: attackerBefore.hp,
      hpAfter: attackerAfter && isDeployedUnit(attackerAfter) ? attackerAfter.hp : 0,
    },
    defender: {
      kind: defenderBefore.kind,
      weapon: counterWeapon,
      owner: defenderBefore.owner,
      position: { ...defenderBefore.position },
      hpBefore: defenderBefore.hp,
      hpAfter: defenderAfter && isDeployedUnit(defenderAfter) ? defenderAfter.hp : 0,
    },
    terrain: terrain.kind,
  };
}
