import { getLocale } from './locale';
import type { ArmyCount } from './matchVariants';
import type { TitleMapCard } from './overlays';
import { escapeHtml, uiText } from './strings';
import { timingSummary } from './turnTiming';

const categories = ['all', 'battle', 'mission', 'exercise', 'custom'] as const;
export type CatalogCategory = (typeof categories)[number];
type FilterKey = 'armies' | 'size' | 'terrain' | 'clear';
export interface CatalogFilters {
  category: CatalogCategory;
  armies: string;
  size: string;
  terrain: string;
  clear: string;
  open: boolean;
}
export interface CatalogFormat {
  armies: readonly ArmyCount[];
  width: number;
  height: number;
  terrain: 'land' | 'water';
  multiplayer?: boolean;
  preview?: (count: ArmyCount) => string;
  victory?: string;
  timing?: string;
}
export const defaultCatalogFilters = (): CatalogFilters => ({ category: 'all', armies: '', size: '', terrain: '', clear: '', open: false });
const label = (ja: string, en: string) => (getLocale() === 'ja' ? ja : en);
const categoryLabels = () => [
  label('すべて', 'All'),
  label('対戦', 'Battles'),
  label('作戦・任務', 'Missions'),
  label('戦術演習', 'Exercises'),
  label('生成・カスタム', 'Generated & custom'),
];
const clearLabel = (status: TitleMapCard['clear']) =>
  status === 'cleared' ? label('クリア済み', 'Cleared') : status === 'uncleared' ? label('未クリア', 'Uncleared') : label('クリア記録対象外', 'Clear status untracked');

function matchingFormats(map: TitleMapCard, filters: CatalogFilters): CatalogFormat[] {
  if (filters.category !== 'all' && (map.category ?? (map.custom ? 'custom' : 'battle')) !== filters.category) return [];
  if (filters.clear && (map.clear ?? 'untracked') !== filters.clear) return [];
  const formats: CatalogFormat[] = map.formats ?? [{ armies: [2], width: map.width, height: map.height, terrain: 'land' }];
  return formats.filter((format) => {
    const side = Math.max(format.width, format.height);
    const size = side >= 32 ? 'wide' : side <= 18 ? 'small' : 'medium';
    return (
      (!filters.armies || format.armies.some((n) => String(n) === filters.armies)) &&
      (!filters.size || size === filters.size) &&
      (!filters.terrain || format.terrain === filters.terrain)
    );
  });
}

function renderCard(map: TitleMapCard, formats: CatalogFormat[], filters: CatalogFilters): string {
  const counts = [...new Set(formats.flatMap((format) => format.armies))].sort();
  const range = counts.length === 3 ? label('2〜4軍', '2–4 armies') : label(counts.join('・') + '軍', counts.join(' or ') + ' armies');
  const sizes = [...new Set(formats.map((f) => uiText.titleBoard(f.width, f.height)))].join(' / ');
  const terrain = [...new Set(formats.map((f) => (f.terrain === 'water' ? label('水域', 'Water') : label('陸', 'Land'))))].join(' / ');
  const chosen = formats[0]!;
  const multiCount = chosen.multiplayer ? (chosen.armies.find((n) => String(n) === filters.armies) ?? chosen.armies.at(-1)) : undefined;
  const preview = (multiCount && chosen.preview?.(multiCount)) || map.preview;
  const alternate = chosen.multiplayer && map.formats?.some((format) => !format.multiplayer);
  const funds = alternate ? '' : uiText.titleGold(map.startingGold) + ' · ';
  const rules = chosen.multiplayer ? label('規則を選択可', 'Configurable rules') : map.rules;
  const victory = alternate ? (chosen.victory ?? map.victory) : map.victory;
  const timing = (alternate ? chosen.timing : map.timing) ?? timingSummary({ deadline: map.turnLimit });
  return `<li class="title-map-entry"><button type="button" class="title-map-card" data-map-id="${escapeHtml(map.id)}" ${map.selected ? 'aria-current="true"' : ''} ${multiCount ? `data-catalog-armies="${Number(multiCount)}"` : ''}>
    ${preview}<span class="title-map-name">${escapeHtml(map.name)}${map.custom ? `<em>${uiText.titleCustom}</em>` : ''}</span>
    <span class="title-map-facts"><span class="catalog-armies">${range}</span><span>${sizes}</span><span>${terrain}${map.theme ? ' · ' + escapeHtml(map.theme) : ''}</span>${rules ? `<span class="catalog-rule">${escapeHtml(rules)}</span>` : ''}</span>
    <span class="title-map-victory">${escapeHtml(victory)}</span><span class="catalog-clear">${clearLabel(map.clear)}</span>
    <span class="catalog-timing">${escapeHtml(funds)}${escapeHtml(timing)}</span>
  </button>${map.custom ? `<button type="button" class="save-action title-map-delete" id="title-delete-${escapeHtml(map.id)}" data-delete-custom-map="${escapeHtml(map.id)}" data-user-attributes="aria-label" aria-label="${escapeHtml(uiText.customMapDeleteLabel(map.name))}">${uiText.customMapDelete}</button>` : ''}</li>`;
}

export function renderTitleCatalog(maps: readonly TitleMapCard[], filters: CatalogFilters = defaultCatalogFilters()): string {
  const cards = maps.flatMap((map) => {
    const formats = matchingFormats(map, filters);
    return formats.length ? [renderCard(map, formats, filters)] : [];
  });
  const labels = categoryLabels();
  const select = (key: FilterKey, title: string, choices: [string, string][]) =>
    `<label>${title}<select id="title-filter-${key}" data-catalog-filter="${key}">${[['', label('すべて', 'Any')], ...choices].map(([v, name]) => `<option value="${v}" ${v === filters[key] ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`;
  const filterFields = [
    select(
      'armies',
      label('軍数', 'Armies'),
      [2, 3, 4].map((n) => [String(n), label(`${n}軍`, `${n} armies`)]),
    ),
    select('size', label('盤面サイズ', 'Board size'), [
      ['small', label('小', 'Small')],
      ['medium', label('中', 'Medium')],
      ['wide', label('広域', 'Wide')],
    ]),
    select('terrain', label('地形', 'Terrain'), [
      ['land', label('陸', 'Land')],
      ['water', label('水域', 'Water')],
    ]),
    select('clear', label('クリア状況', 'Clear status'), [
      ['cleared', clearLabel('cleared')],
      ['uncleared', clearLabel('uncleared')],
      ['untracked', clearLabel('untracked')],
    ]),
  ].join('');
  return `<section id="title-catalog" aria-labelledby="title-catalog-heading"><h3 id="title-catalog-heading" tabindex="-1">${uiText.titleMapsHeading}</h3>
    <div class="catalog-tabs" role="tablist" aria-label="${label('戦域の分類', 'Battlefield categories')}">${categories.map((category, i) => `<button type="button" role="tab" id="title-category-${category}" aria-selected="${filters.category === category}" aria-controls="title-catalog-results" tabindex="${filters.category === category ? 0 : -1}" data-catalog-category="${category}">${labels[i]}</button>`).join('')}</div>
    <details id="title-catalog-filters" ${filters.open ? 'open' : ''}><summary>${label('絞り込み', 'Filter battlefields')}</summary><div class="catalog-filter-fields">${filterFields}<button id="title-filter-reset" type="button" class="save-action">${label('絞り込みを解除', 'Clear filters')}</button></div></details>
    ${filters.category === 'custom' ? `<button class="save-action" id="title-catalog-create" type="button">${label('マップを生成・編集', 'Generate or edit maps')}</button>` : ''}
    <div role="tabpanel" id="title-catalog-results" aria-labelledby="title-category-${filters.category}"><p class="catalog-count" role="status">${cards.length ? label(`${cards.length}件の戦域`, `${cards.length} battlefields`) : label('該当する戦域がありません。', 'No matching battlefields.')}</p><ol id="title-map-list" class="title-map-list">${cards.join('')}</ol></div></section>`;
}

export function bindTitleCatalog(root: HTMLElement, filters: CatalogFilters, redraw: (focus: string) => void): void {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-catalog-category]')];
  tabs.forEach((tab, i) => {
    tab.onclick = () => {
      filters.category = categories[i]!;
      redraw('#' + tab.id);
    };
    tab.onkeydown = (event) => {
      let index: number;
      if (event.key === 'ArrowLeft') index = (i + tabs.length - 1) % tabs.length;
      else if (event.key === 'ArrowRight') index = (i + 1) % tabs.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[index]!.click();
    };
  });
  root.querySelectorAll<HTMLSelectElement>('select[data-catalog-filter]').forEach((select) => {
    select.onchange = () => {
      filters[select.dataset.catalogFilter as FilterKey] = select.value;
      filters.open = true;
      redraw('#' + select.id);
    };
  });
  const details = root.querySelector<HTMLDetailsElement>('#title-catalog-filters');
  if (details)
    details.ontoggle = () => {
      if (details.isConnected) filters.open = details.open;
    };
  const reset = root.querySelector<HTMLButtonElement>('#title-filter-reset');
  if (reset)
    reset.onclick = () => {
      Object.assign(filters, defaultCatalogFilters(), { category: filters.category, open: true });
      redraw('#title-filter-reset');
    };
}
