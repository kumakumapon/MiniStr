import type { ScenarioTheme, TerrainKind } from '../game';
import { terrainNames } from './labels';
import { renderTerrainArt } from './terrainAppearance';
import { getLocale } from './locale';

const kinds: readonly TerrainKind[] = ['plain', 'forest', 'mountain', 'road', 'swamp', 'sea', 'city', 'factory', 'airport', 'port', 'capital', 'supplyDepot'];

/** Static terrain information only: no unit, ownership or fog observations. */
export function renderTerrainLegend(theme: ScenarioTheme, open = false): string {
  const en = getLocale() === 'en';
  return `<details id="terrain-legend" class="terrain-legend" ${open ? 'open' : ''}>
    <summary>${en ? 'Terrain and facility key' : '地形・施設の凡例'}</summary>
    <ul>${kinds.map((kind) => `<li><i class="terrain-key-swatch">${renderTerrainArt(kind, theme)}</i><span>${terrainNames[kind]}</span></li>`).join('')}<li><i class="terrain-key-bridge" aria-hidden="true">${en ? 'BR' : '橋'}</i><span>${en ? 'Temporary bridge' : '仮設橋'}</span></li></ul>
    <p>${en ? 'Icons match this map and its title preview. A supply depot refuels and rearms friendly ground units on its tile and adjacent tiles at turn start; it does not repair HP. Bridges let ground units cross water; their positions are public. Inspect a tile for its defense, movement and service details.' : 'このマップとタイトルの縮小図で同じ図柄を使います。補給所は自軍手番開始時に施設上と隣接地上部隊の燃料・弾薬を補給し、HPは修理しません。仮設橋は地上部隊が水域を通過でき、位置は公開です。防御・移動・補給の詳細はマス情報で確認できます。'}</p>
  </details>`;
}
