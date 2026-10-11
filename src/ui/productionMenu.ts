import type { Position, ProductionFacility } from '../game';
import { terrainNames } from './labels';
import { escapeHtml, uiText } from './strings';

interface ProductionMenuOptions {
  facilities: readonly ProductionFacility[];
  target: Position | undefined;
  funds: number;
  summary: string;
  units: string;
  notice: string;
}

/** Only the roster scrolls; target selection, funds and feedback stay visible. */
export function renderProductionMenu(options: ProductionMenuOptions): string {
  const { facilities, target, funds, summary, units, notice } = options;
  const choices = facilities
    .map((facility) => {
      const { x, y } = facility.position;
      const selected = target?.x === x && target.y === y;
      return `<option value="${x},${y}" ${selected ? 'selected' : ''}>${terrainNames[facility.kind]} (${x + 1}, ${y + 1})</option>`;
    })
    .join('');
  return `<div class="production-menu-backdrop" id="production-menu-backdrop">
    <section id="production-menu" class="production-menu" role="dialog" aria-modal="true" aria-labelledby="production-menu-title" tabindex="-1">
      <header class="production-menu-header"><div><p class="card-kicker">PRODUCTION</p><h2 id="production-menu-title">${uiText.unitProduction}</h2></div><button id="production-menu-close" class="save-action" aria-label="生産メニューを閉じる">閉じる ×</button></header>
      <div class="production-menu-controls"><strong class="production-menu-funds">資金 ${funds}G</strong><label>生産先<select id="production-facility" ${facilities.length ? '' : 'disabled'}>${choices || '<option>空き施設なし</option>'}</select></label>${summary}
        <p class="production-menu-notice" role="status">${escapeHtml(notice || 'ユニットを選んで生産。生産後は次の空き施設に切り替わります。')}</p></div>
      <div id="production-menu-body" class="production-menu-body">${facilities.length ? `<div class="production-grid">${units}</div>` : '<p class="production-menu-empty">生産可能な空き施設がありません。部隊を施設から移動すると、再び生産できます。</p>'}</div>
    </section></div>`;
}
