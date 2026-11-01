import { groundUnit, tacticalEnabled } from './tactics';
import { isDeployedUnit, isGameOver, type GameResult, type GameState } from './types';
import { weaponAmmo, weaponsForUnit } from './weapons';
import type { WeaponSlot } from './units';

export function prepareAmbush(state: GameState, unitId: string, slot: WeaponSlot = 0): GameResult {
  const unit = state.units.find((u) => u.id === unitId);
  if (
    isGameOver(state) ||
    !tacticalEnabled(state, 'ambush') ||
    !unit ||
    !isDeployedUnit(unit) ||
    unit.owner !== state.activePlayer ||
    unit.hasMoved ||
    unit.hasActed ||
    !groundUnit(unit)
  )
    return { ok: false, error: 'Ambush is not available' };
  const weapon = weaponsForUnit(unit.kind, state)[slot];
  if (!weapon || weapon.indirect || weapon.range[0] > 1 || weaponAmmo(unit, slot) <= 0) return { ok: false, error: 'A loaded direct weapon is required' };
  return { ok: true, value: { ...state, units: state.units.map((u) => (u.id === unit.id ? { ...u, ambush: slot, hasMoved: true, hasActed: true } : u)) } };
}

export function toggleDive(state: GameState, unitId: string): GameResult {
  const unit = state.units.find((u) => u.id === unitId);
  if (
    isGameOver(state) ||
    !tacticalEnabled(state, 'submarines') ||
    !unit ||
    !isDeployedUnit(unit) ||
    unit.kind !== 'submarine' ||
    unit.owner !== state.activePlayer ||
    unit.hasMoved ||
    unit.hasActed
  )
    return { ok: false, error: 'Dive action is not available' };
  if (!unit.submerged && state.board.terrain[unit.position.y]![unit.position.x]!.kind !== 'sea') return { ok: false, error: 'Submarines dive in open sea' };
  return { ok: true, value: { ...state, units: state.units.map((u) => (u.id === unit.id ? { ...u, submerged: !u.submerged, diveTurns: 0, hasMoved: true, hasActed: true } : u)) } };
}
