import atlasUrl from '../assets/terrain-atlas.webp';
import type { ScenarioTheme, TerrainKind } from '../game';

/** One atlas layout for the board, title miniature and terrain key. */
const cells: Record<TerrainKind, readonly [number, number]> = {
  forest: [1, 0],
  mountain: [2, 0],
  road: [3, 0],
  swamp: [0, 1],
  sea: [1, 1],
  city: [2, 1],
  factory: [3, 1],
  airport: [0, 2],
  port: [1, 2],
  capital: [2, 2],
  plain: [3, 2],
  supplyDepot: [2, 1],
};
const themes: readonly ScenarioTheme[] = ['temperate', 'desert', 'snow', 'urban', 'coastal'];
const safeKind = (kind: TerrainKind): TerrainKind => (Object.hasOwn(cells, kind) ? kind : 'plain');
const safeTheme = (theme: ScenarioTheme): ScenarioTheme => (themes.includes(theme) ? theme : 'temperate');

export function terrainFilter(kind: TerrainKind, theme: ScenarioTheme): string {
  kind = safeKind(kind);
  switch (safeTheme(theme)) {
    case 'desert':
      return kind === 'sea' || kind === 'port' ? 'none' : kind === 'forest' ? 'sepia(0.35)' : 'sepia(0.95) saturate(1.5) hue-rotate(350deg) brightness(1.05)';
    case 'snow':
      return kind === 'plain' ? 'grayscale(1) brightness(1.75)' : kind === 'road' ? 'grayscale(1) brightness(1.4)' : 'saturate(0.6) brightness(1.12)';
    case 'urban':
      return 'grayscale(0.75) brightness(0.88)';
    case 'coastal':
      return 'saturate(1.2) brightness(1.08)';
    default:
      return 'none';
  }
}

/** A fixed, ID-free pattern works in every miniature and avoids SVG ID clashes. */
const depotPattern = '<rect width="16" height="16" fill="#646b3f"/><path d="M-8 0H0L16 16H8ZM8 0H16L32 16H24Z" fill="#8e8d54"/>';

export function renderTerrainArt(kind: TerrainKind, theme: ScenarioTheme): string {
  kind = safeKind(kind);
  const [x, y] = cells[kind];
  const filter = terrainFilter(kind, theme);
  if (kind === 'supplyDepot')
    return `<span class="terrain-art" data-terrain-art="${kind}" style="filter:${filter}" aria-hidden="true"><svg viewBox="0 0 16 16">${depotPattern}</svg></span>`;
  return `<span class="terrain-art" data-terrain-art="${kind}" style="background-image:url('${atlasUrl}');background-size:400% 400%;background-position:${(x * 100) / 3}% ${(y * 100) / 3}%;filter:${filter}" aria-hidden="true"></span>`;
}

/** One small pattern per used terrain, then cheap row runs in the miniature. */
export function renderTerrainPattern(kind: TerrainKind, theme: ScenarioTheme, id: string): string {
  kind = safeKind(kind);
  const [column, row] = cells[kind];
  const viewBox = kind === 'supplyDepot' ? '0 0 16 16' : `${column} ${row} 1 1`;
  const image = kind === 'supplyDepot' ? depotPattern : `<image href="${atlasUrl}" width="4" height="4"/>`;
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="1" height="1" viewBox="${viewBox}" overflow="hidden"><g style="filter:${terrainFilter(kind, theme)}">${image}</g></pattern>`;
}
