import { destroyBridgeError } from '../game/bridges';
import { BRIDGE_COST, MAX_BRIDGES, bridgeBanks, bridgeDestinations, bridgeError, hasBridge, usesBridgeRules, type GameState, type PlayerId, type Position } from '../game';
import { getLocale } from './locale';
import { escapeHtml } from './strings';

export interface BridgePending {
  unitId: string;
  destination?: Position;
}

export function renderBridgeControls(state: GameState, viewer: PlayerId, selected: string | undefined, enabled: boolean, pending?: BridgePending): string {
  if (!usesBridgeRules(state)) return '';
  const unit = state.units.find((unit) => unit.id === selected && unit.owner === viewer);
  if (unit?.kind !== 'engineer') return '';
  const english = getLocale() === 'en';
  const targets = bridgeDestinations(state, unit.id);
  const error = bridgeError(state, unit.id) ?? (targets.length ? undefined : '隣接する建設可能な水域がありません。');
  const active = pending?.unitId === unit.id;
  const target = active ? pending.destination : undefined;
  const count = state.bridges?.filter((site) => site.owner === viewer).length ?? 0;
  return `<section id="bridge-controls" class="frontline-controls" aria-label="${english ? 'Bridge construction' : '仮設橋の建設'}">
    <span>${english ? 'Bridges built' : '建設した橋'} ${count} / ${MAX_BRIDGES}</span>
    ${active ? `${target ? `<button id="bridge-confirm" class="save-action" ${!enabled || bridgeError(state, unit.id, target) ? 'disabled' : ''}>${english ? 'Confirm bridge' : '架橋を確定'} (${target.x + 1}, ${target.y + 1}) · ${BRIDGE_COST}G</button>` : `<strong>${english ? 'Choose a highlighted water tile.' : '光る水域を選択してください。'}</strong>`}<button id="bridge-cancel" class="save-action">${english ? 'Cancel' : '中止'}</button>` : `<button id="bridge-unit" class="save-action" ${!enabled || error ? 'disabled' : ''}>${english ? 'Build bridge' : '仮設橋を建設'} (${BRIDGE_COST}G)</button>`}
    ${(state.bridges ?? [])
      .filter((site) => !destroyBridgeError(state, unit.id, site.position))
      .map(
        (site) =>
          `<button class="bridge-destroy save-action" data-x="${site.position.x}" data-y="${site.position.y}" ${!enabled ? 'disabled' : ''}>${english ? 'Destroy bridge' : '橋を破壊'} (${site.position.x + 1}, ${site.position.y + 1})</button>`,
      )
      .join('')}
    <small role="status">${escapeHtml(error ?? (english ? 'One water tile. Both armies and ships may pass; one unit per tile. Location is public. Construction ends the engineer’s turn.' : '1マス幅の水域。両軍・艦船が通行可能、1マス1部隊。完成位置は公開。架橋で工兵の行動終了。'))}</small>
  </section>`;
}

/** Completed crossings are public even under fog; this marker carries no unit information. */
export function bridgeMarker(state: GameState, position: Position): string {
  if (!hasBridge(state, position)) return '';
  const horizontal = bridgeBanks(state.board, position).some((bank) => bank.x !== position.x);
  return `<span class="bridge-marker ${horizontal ? 'horizontal' : 'vertical'}" aria-hidden="true"><b>${getLocale() === 'en' ? 'B' : '橋'}</b></span>`;
}
