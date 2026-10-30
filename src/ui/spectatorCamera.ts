import { isDeployedUnit, type DeployedUnit, type GameCommand, type GameState, type Position } from '../game';
import { unitNames } from './labels';
import { sideName } from './matchControl';
import { escapeHtml, uiText } from './strings';

export function renderSpectatorCamera(state: GameState, visible: ReadonlySet<string>, follow: boolean, locatedUnitId?: string): string {
  const units = spectatorUnits(state, visible);
  return `<div class="spectate-camera-controls" role="group" aria-label="${uiText.spectateCamera}">
    <button id="spectate-follow" class="save-action spectate-follow" aria-pressed="${follow}"><span aria-hidden="true">${follow ? '✓' : '○'}</span> ${uiText.spectateFollow}</button>
    <label class="spectate-locate">${uiText.spectateLocate}<select id="spectate-locate-unit" ${units.length ? '' : 'disabled'}>
      <option value="">${uiText.spectateChooseUnit}</option>${units.map((unit) => `<option value="${escapeHtml(unit.id)}" ${unit.id === locatedUnitId ? 'selected' : ''}>${escapeHtml(sideName('spectate', unit.owner))} ${escapeHtml(unitNames[unit.kind])} (${Number(unit.position.x + 1)}, ${Number(unit.position.y + 1)}) · ${escapeHtml(unit.id)}</option>`).join('')}
    </select></label>
  </div>`;
}

/** Only offer units currently shown to the spectator, including in the fogged viewpoint. */
export function spectatorUnits(state: GameState, visible: ReadonlySet<string>): DeployedUnit[] {
  return state.units
    .filter((unit): unit is DeployedUnit => isDeployedUnit(unit) && visible.has(`${Number(unit.position.x)},${Number(unit.position.y)}`))
    .sort((a, b) => a.owner.localeCompare(b.owner) || a.id.localeCompare(b.id, 'en', { numeric: true }));
}

/** Prefer the acting unit's new position, retaining its last known tile if it was destroyed. */
export function spectatorActionPosition(before: GameState, after: GameState, command: GameCommand): Position | undefined {
  if (command.type === 'recon') return { ...command.center };
  if (command.type === 'disembark' || command.type === 'bridge' || command.type === 'destroyBridge') return { ...command.destination };
  if (command.type === 'produce') return { ...command.factory };
  if (command.type === 'endTurn') {
    const unit = after.units.find((unit) => unit.owner === after.activePlayer && isDeployedUnit(unit));
    return unit?.position && { ...unit.position };
  }
  const ids = command.type === 'embark' ? [command.transportId, command.unitId] : command.type === 'merge' ? [command.unitId, command.targetId] : [command.unitId];
  for (const state of [after, before]) {
    for (const id of ids) {
      const unit = state.units.find((unit) => unit.id === id && isDeployedUnit(unit));
      if (unit?.position) return { ...unit.position };
    }
  }
  return undefined;
}

/** Center inside the map's own scroll area without scrolling the page or taking focus. */
export function centerBoardOnPosition(root: ParentNode, position: Position): void {
  if (!Number.isSafeInteger(position.x) || !Number.isSafeInteger(position.y) || position.x < 0 || position.y < 0) return;
  const viewport = root.querySelector<HTMLElement>('#board-viewport');
  const tile = viewport?.querySelector<HTMLElement>(`.tile[data-x="${Number(position.x)}"][data-y="${Number(position.y)}"]`);
  if (!viewport || !tile) return;
  const frame = viewport.getBoundingClientRect();
  const target = tile.getBoundingClientRect();
  const left = viewport.scrollLeft + target.left - frame.left - viewport.clientLeft + target.width / 2 - viewport.clientWidth / 2;
  const top = viewport.scrollTop + target.top - frame.top - viewport.clientTop + target.height / 2 - viewport.clientHeight / 2;
  viewport.scrollLeft = Math.max(0, Math.min(left, viewport.scrollWidth - viewport.clientWidth));
  viewport.scrollTop = Math.max(0, Math.min(top, viewport.scrollHeight - viewport.clientHeight));
}
