import { deploymentPositionArea, deploymentPositionOptions, isFixedDeploymentPosition, type ReadonlyDeploymentPlacements } from '../game/deploymentPositions';
import type { ScenarioDefinition } from '../game/maps';
import { positionKey } from '../game/terrain';
import type { PlayerId, UnitKind } from '../game/types';
import { getLocale } from './locale';
import { escapeHtml } from './strings';

export interface DeploymentPositionView {
  placements: ReadonlyDeploymentPlacements;
}

export function renderDeploymentPositionChoice(scenario: ScenarioDefinition, player: PlayerId, index: number, kind: UnitKind, view: DeploymentPositionView): string {
  const position = view.placements[player][index]!;
  const id = `${player[0]}${index + 1}`;
  const fixed = isFixedDeploymentPosition(scenario, player, index);
  const en = getLocale() === 'en';
  const options = fixed ? [position] : deploymentPositionOptions(scenario, player, index, view.placements, kind);
  return `<label class="deployment-position-choice"><span>${en ? 'Starting position' : '出撃位置'}${fixed ? ` · ${en ? 'Fixed position' : '配置固定'}` : ''}</span><select id="briefing-position-${player}-${index}" data-position-player="${player}" data-position-slot="${index}" aria-label="${escapeHtml(id)} ${en ? 'starting position' : '出撃位置'}" ${fixed ? 'disabled' : ''}>${options.map((candidate) => `<option value="${positionKey(candidate)}" ${positionKey(candidate) === positionKey(position) ? 'selected' : ''}>(${candidate.x + 1}, ${candidate.y + 1})</option>`).join('')}</select></label>`;
}

/** A compact area preview stays inside the briefing; coordinates use the board's one-based labels. */
export function renderDeploymentPositionArea(scenario: ScenarioDefinition, player: PlayerId, view: DeploymentPositionView): string {
  const en = getLocale() === 'en';
  const area = deploymentPositionArea(scenario, player);
  const occupied = new Map(view.placements[player].map((position, index) => [positionKey(position), `${player[0]}${index + 1}`]));
  const first = area[0]!,
    last = area.at(-1)!;
  return `<section class="deployment-position-area" aria-label="${en ? 'Starting area preview' : '配置区域のプレビュー'}"><p>${en ? 'Starting area' : '配置区域'}: X ${first.x + 1}–${last.x + 1}, Y ${first.y + 1}–${last.y + 1} · ${en ? 'Aircraft positions stay fixed.' : '航空部隊の位置は固定です。'}</p><ol class="deployment-position-grid">${area
    .map((position) => {
      const id = occupied.get(positionKey(position));
      return `<li class="${id ? `deployment-position-unit ${player}` : ''}"><span>(${position.x + 1}, ${position.y + 1})</span><strong>${id ?? (en ? 'Empty' : '空き')}</strong></li>`;
    })
    .join('')}</ol><button class="save-action" data-position-reset="${player}">${en ? 'Restore positions only' : '位置だけ既定に戻す'}</button></section>`;
}

export function renderDeploymentPositionNote(): string {
  return getLocale() === 'en'
    ? '<p class="deployment-position-note">Canyon Checkpoint: move the four ground slots within your starting area. Coordinates count from 1. Unit presets save types only; applying one restores that army’s default positions.</p>'
    : '<p class="deployment-position-note">峡谷の関門：自軍の配置区域内で地上4枠を動かせます。座標は1から表示します。兵科プリセットは位置を保存せず、適用するとその軍を既定位置へ戻します。</p>';
}
