import { forecastCombat } from '../game/combat';
import { visibleEnemies } from '../game/fog';
import { idleProductionFacilities } from '../game/facilities';
import { scenarioForState } from '../game/maps';
import { adjacentCells, groundUnit, tacticalEnabled, weatherAt } from '../game/tactics';
import { manhattanDistance, terrainAt } from '../game/terrain';
import { isDeployedUnit, type GameState, type PlayerId } from '../game/types';
import { transportCapacity, unitStats, type WeaponSlot } from '../game/units';
import { weaponAmmo, weaponsForUnit } from '../game/weapons';
import type { CpuAction } from './rules';

/** Optional actions use own units, public terrain and confirmed contacts only. */
export function chooseTacticalAction(state: GameState, player: PlayerId, defensive: boolean): CpuAction | undefined {
  if (!state.tactics) return;
  const own = state.units.filter((u) => u.owner === player);
  const enemies = visibleEnemies(state, player);
  const reserved = own.filter((u) => u.ambush !== undefined).length;
  for (const unit of own) {
    if (!isDeployedUnit(unit) || unit.hasMoved || unit.hasActed) continue;
    if (
      unit.kind === 'submarine' &&
      tacticalEnabled(state, 'submarines') &&
      !unit.submerged &&
      terrainAt(state.board, unit.position)?.kind === 'sea' &&
      (unit.fuel ?? 70) > 12 &&
      !enemies.some((e) => e.kind === 'destroyer' && isDeployedUnit(e) && manhattanDistance(e.position, unit.position) <= 3) &&
      !enemies.some((e) => forecastCombat(state, unit, e).ok)
    )
      return { type: 'dive', unitId: unit.id };
    const tile = terrainAt(state.board, unit.position);
    const front =
      Math.abs(unit.position.x - (state.board.width - 1) / 2) <= state.board.width / 3 && Math.abs(unit.position.y - (state.board.height - 1) / 2) <= state.board.height / 4;
    const threat = enemies.some((e) => isDeployedUnit(e) && manhattanDistance(e.position, unit.position) <= (weatherAt(state) === 'rain' ? 3 : 4));
    const watchApproach = defensive && reserved === 0 && front && ((tile?.kind === 'city' && tile.owner === player) || tile?.kind === 'forest' || tile?.kind === 'mountain');
    if (
      tacticalEnabled(state, 'ambush') &&
      groundUnit(unit) &&
      transportCapacity(unit.kind) === 0 &&
      (!unitStats[unit.kind].indirect || unit.hp < 35) &&
      (defensive || unit.hp < 50) &&
      reserved < 2 &&
      ((tile?.owner === player && threat) || watchApproach)
    ) {
      const slot = weaponsForUnit(unit.kind, state).findIndex((w, i) => !w.indirect && w.range[0] === 1 && weaponAmmo(unit, i as WeaponSlot) > 0);
      if (slot >= 0) return { type: 'ambush', unitId: unit.id, weaponSlot: slot as WeaponSlot };
    }
  }
  if (!tacticalEnabled(state, 'submarines')) return;
  const facilities = idleProductionFacilities(state, player, scenarioForState(state)?.productionRules).filter((f) => f.kind === 'port');
  const port = facilities[0];
  if (!port) return;
  const escorts = own.filter((u) => u.kind === 'destroyer').length;
  const needsEscort = own.some((u) => u.kind === 'landingShip' && state.units.some((c) => c.embarkedIn === u.id)) || enemies.some((e) => e.kind === 'submarine');
  if (!escorts && needsEscort && state.players[player].gold >= unitStats.destroyer.cost) return { type: 'produce', factory: port.position, kind: 'destroyer' };
  if (
    escorts > 0 &&
    !own.some((u) => u.kind === 'submarine') &&
    state.players[player].gold >= unitStats.submarine.cost &&
    adjacentCells(port.position).some((p) => terrainAt(state.board, p)?.kind === 'sea')
  )
    return { type: 'produce', factory: port.position, kind: 'submarine' };
}
