import { incomePropertyCount } from '../game/state';
import { isDeployedUnit, usesModernRules, type GameState, type PlayerId } from '../game/types';
import { logisticsOrder, usesLogisticsOrders } from '../game/logisticsOrders';
import { unitStats } from '../game/units';
import { weaponAmmo, weaponsForUnit } from '../game/weapons';
import { applyModernUpkeep } from '../game/logistics';
import type { GameCommand } from '../game/session';
import { supplyOutlook } from './frontline';
import { getLocale } from './locale';
import { unitNames } from './labels';
import { escapeHtml } from './strings';

let rosterOpen = false;
let rosterFilter = 'all';

export function renderLogisticsRoster(state: GameState, player: PlayerId, canAct: boolean, selected?: string): string {
  const en = getLocale() === 'en';
  const t = (ja: string, english: string) => (en ? english : ja);
  const units = state.units.filter((u) => u.owner === player);
  const summary = `${t('部隊・兵站一覧', 'Units and logistics')} (${units.length})`;
  if (!rosterOpen) return `<details id="logistics-roster" class="logistics-roster"><summary id="logistics-roster-toggle">${summary}</summary></details>`;
  const projected = usesModernRules(state)
    ? applyModernUpkeep(
        { ...state, players: { ...state.players, [player]: { ...state.players[player], gold: state.players[player].gold + incomePropertyCount(state, player) * 1000 } } },
        player,
      )
    : state;
  const supported = usesLogisticsOrders(state);
  const rows = units
    .map((unit) => {
      const order = logisticsOrder(state, unit);
      const ammo = weaponsForUnit(unit.kind, state)
        .map((w, i) => `${weaponAmmo(unit, i === 0 ? 0 : 1)}/${w.ammo}`)
        .join(' · ');
      const dry = (unit.fuel ?? unitStats[unit.kind].fuel) < unitStats[unit.kind].fuel / 3;
      const lowAmmo = weaponsForUnit(unit.kind, state).some((w, i) => weaponAmmo(unit, i === 0 ? 0 : 1) < w.ammo);
      const after = projected.units.find((u) => u.id === unit.id)!;
      const field = (key: string, label: string, options: string) =>
        `<label>${label}<select id="logistics-${escapeHtml(unit.id)}-${key}" data-logistics-field="${key}" data-unit="${escapeHtml(unit.id)}" ${!canAct ? 'disabled' : ''}>${options}</select></label>`;
      return `<li ${rosterFilter !== 'all' && !(rosterFilter === 'damaged' ? unit.hp < 100 : rosterFilter === 'ammo' ? lowAmmo : rosterFilter === 'fuel' ? dry : !unit.hasActed) ? 'hidden' : ''} data-logistics-row data-damaged="${unit.hp < 100}" data-ammo="${lowAmmo}" data-fuel="${dry}" data-ready="${!unit.hasActed}" data-selected="${unit.id === selected}"><button class="save-action" data-logistics-select="${escapeHtml(unit.id)}">${escapeHtml(unitNames[unit.kind])} · ${escapeHtml(unit.callsign ?? unit.id)}${!isDeployedUnit(unit) ? ` (${t('搭載中', 'Embarked')})` : ''}</button><p>HP ${unit.hp} · ${t('弾薬', 'Ammo')} ${ammo} · ${t('燃料', 'Fuel')} ${unit.fuel ?? unitStats[unit.kind].fuel}/${unitStats[unit.kind].fuel} · ${unit.hasActed ? t('行動済み', 'Acted') : t('未行動', 'Ready')}</p><p>${escapeHtml(supplyOutlook(state, unit))}</p><p>${t('現配置での次手番見込み', 'Next-turn estimate at current positions')}: HP ${after.hp} · ${t('燃料', 'Fuel')} ${after.fuel ?? unitStats[unit.kind].fuel} · ${t('弾薬', 'Ammo')} ${weaponsForUnit(
        after.kind,
        state,
      )
        .map((_, i) => weaponAmmo(after, i === 0 ? 0 : 1))
        .join(
          ' / ',
        )}</p>${supported ? field('priority', t('補給順', 'Supply priority'), `<option value="false" ${!order.priority ? 'selected' : ''}>${t('通常', 'Normal')}</option><option value="true" ${order.priority ? 'selected' : ''}>${t('優先', 'Priority')}</option>`) + field('resource', t('物資配分', 'Allocation'), `<option value="ammo" ${order.resource === 'ammo' ? 'selected' : ''}>${t('弾薬優先', 'Ammo first')}</option><option value="fuel" ${order.resource === 'fuel' ? 'selected' : ''}>${t('燃料優先', 'Fuel first')}</option>`) + field('repair', t('修理', 'Repair'), `<option value="true" ${order.repair ? 'selected' : ''}>${t('実施', 'Enabled')}</option><option value="false" ${!order.repair ? 'selected' : ''}>${t('保留', 'Hold')}</option>`) : ''}</li>`;
    })
    .join('');
  return `<details open id="logistics-roster" class="logistics-roster"><summary id="logistics-roster-toggle">${t('部隊・兵站一覧', 'Units and logistics')} (${units.length})</summary><p>${t('敵行動や施設所有の変化で見込みは変わります。留保資金は修理だけを制限します。', 'Enemy actions or ownership changes can alter estimates. Reserved funds limit repairs only.')}</p>${supported ? `<label>${t('修理後に残す資金', 'Funds to reserve after repairs')}<input id="repair-reserve" type="number" min="0" max="1000000" step="1" value="${state.repairReserve?.[player] ?? 0}" ${!canAct ? 'disabled' : ''}></label>` : `<p>${t('この対局は従来の自動補給・修理を使用します。', 'This match uses legacy automatic supply and repairs.')}</p>`}<label>${t('絞り込み', 'Filter')}<select id="logistics-filter"><option value="all">${t('すべて', 'All')}</option><option value="damaged">${t('損傷', 'Damaged')}</option><option value="ammo">${t('弾薬不足', 'Ammo missing')}</option><option value="fuel">${t('燃料不足', 'Low fuel')}</option><option value="ready">${t('未行動', 'Ready')}</option></select></label><ul id="logistics-list">${rows}</ul></details>`;
}

export function bindLogisticsRoster(root: HTMLElement, refresh: () => void, dispatch: (command: GameCommand) => void, select: (id: string) => void): void {
  const details = root.querySelector<HTMLDetailsElement>('#logistics-roster');
  if (details)
    details.ontoggle = () => {
      if (details.open !== rosterOpen) {
        rosterOpen = details.open;
        refresh();
      }
    };
  root.querySelectorAll<HTMLButtonElement>('[data-logistics-select]').forEach((button) => (button.onclick = () => select(button.dataset.logisticsSelect!)));
  root.querySelectorAll<HTMLSelectElement>('[data-logistics-field]').forEach(
    (input) =>
      (input.onchange = () => {
        const row = input.closest('li')!;
        const value = (field: string) => row.querySelector<HTMLSelectElement>(`[data-logistics-field="${field}"]`)!.value;
        dispatch({
          type: 'logistics',
          unitId: input.dataset.unit!,
          order: { priority: value('priority') === 'true', resource: value('resource') === 'fuel' ? 'fuel' : 'ammo', repair: value('repair') === 'true' },
        });
      }),
  );
  const reserve = root.querySelector<HTMLInputElement>('#repair-reserve');
  if (reserve)
    reserve.onchange = () => {
      if (reserve.value !== '' && reserve.checkValidity()) dispatch({ type: 'repairReserve', amount: Number(reserve.value) });
    };
  const filter = root.querySelector<HTMLSelectElement>('#logistics-filter');
  if (filter) {
    filter.value = rosterFilter;
    filter.onchange = () => {
      rosterFilter = filter.value;
      root.querySelectorAll<HTMLElement>('[data-logistics-row]').forEach((row) => (row.hidden = rosterFilter !== 'all' && row.dataset[rosterFilter] !== 'true'));
    };
  }
}
