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
const terrainKinds = Object.keys(cells) as TerrainKind[];
const safeKind = (kind: TerrainKind): TerrainKind => terrainKinds.find((known) => known === kind) ?? 'plain';
const safeTheme = (theme: ScenarioTheme): ScenarioTheme => themes.find((known) => known === theme) ?? 'temperate';

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
export function renderTerrainPattern(kind: TerrainKind, id: string): string {
  kind = safeKind(kind);
  const [column, row] = cells[kind];
  const viewBox = kind === 'supplyDepot' ? '0 0 16 16' : `${column} ${row} 1 1`;
  const image = kind === 'supplyDepot' ? depotPattern : `<image href="${atlasUrl}" width="4" height="4"/>`;
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="1" height="1" viewBox="${viewBox}" overflow="hidden">${image}</pattern>`;
}

/** WebKit ignores CSS filter functions on SVG graphics. Use SVG 1.1 filter
 * primitives in sRGB, derived from the same operations as the HTML board art. */
export function renderTerrainFilter(kind: TerrainKind, theme: ScenarioTheme, id: string): string {
  const operations = terrainFilter(kind, theme);
  if (operations === 'none') return '';
  const primitives = [...operations.matchAll(/(sepia|grayscale|saturate|hue-rotate|brightness)\(([\d.]+)(?:deg)?\)/g)].map(([, name, raw]) => {
    const amount = Number(raw);
    if (name === 'hue-rotate') return `<feColorMatrix type="hueRotate" values="${amount}"/>`;
    if (name === 'saturate') {
      // An explicit matrix also covers saturation above one consistently.
      const s = amount;
      const values = [
        0.213 + 0.787 * s,
        0.715 - 0.715 * s,
        0.072 - 0.072 * s,
        0,
        0,
        0.213 - 0.213 * s,
        0.715 + 0.285 * s,
        0.072 - 0.072 * s,
        0,
        0,
        0.213 - 0.213 * s,
        0.715 - 0.715 * s,
        0.072 + 0.928 * s,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
      ];
      return `<feColorMatrix type="matrix" values="${values.map((value) => Number(value.toFixed(6))).join(' ')}"/>`;
    }
    if (name === 'brightness')
      return `<feComponentTransfer><feFuncR type="linear" slope="${amount}"/><feFuncG type="linear" slope="${amount}"/><feFuncB type="linear" slope="${amount}"/></feComponentTransfer>`;
    const target = name === 'sepia' ? [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131] : [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722];
    const rows = [0, 1, 2].flatMap((row) => [0, 1, 2].map((column) => (row === column ? 1 - amount : 0) + target[row * 3 + column]! * amount).concat([0, 0]));
    return `<feColorMatrix type="matrix" values="${[...rows, 0, 0, 0, 1, 0].join(' ')}"/>`;
  });
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">${primitives.join('')}</filter>`;
}
