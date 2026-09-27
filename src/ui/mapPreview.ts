import type { Board, PlayerId, ScenarioTheme, TerrainKind } from '../game';

/** Close to the board's own tile colours, flattened for a few pixels per tile. */
const terrainColors: Record<TerrainKind, string> = {
  plain: '#6e9b55',
  forest: '#3a6a45',
  road: '#b3a57a',
  mountain: '#7c876a',
  swamp: '#5a6e40',
  sea: '#347898',
  city: '#8c9a86',
  factory: '#8c9a86',
  airport: '#8c9a86',
  port: '#8c9a86',
  capital: '#8c9a86',
};

/** Per-theme tweaks that mirror `.theme-* .tile.*` in style.css. */
const themeColors: Partial<Record<ScenarioTheme, Partial<Record<TerrainKind, string>>>> = {
  desert: { plain: '#c18b48', road: '#d0ae76' },
  snow: { plain: '#d6e3e5', road: '#c9d6d9', sea: '#4d9ab8', forest: '#2a4838', mountain: '#8b9caa' },
};

const ownerColors: Record<PlayerId | 'neutral', string> = { red: '#e0644f', blue: '#4f8fe0', neutral: '#e4dccb' };

const propertyKinds: ReadonlySet<TerrainKind> = new Set(['city', 'factory', 'airport', 'port', 'capital']);

export interface PreviewUnit {
  owner: PlayerId;
  x: number;
  y: number;
}

/**
 * A decorative SVG miniature of a map: terrain, properties in their owner's
 * colour (headquarters larger), and starting units as dots. Only numbers and
 * colours from the tables above reach the markup, so custom maps need no
 * escaping. Returns '' for a board it cannot draw.
 */
export function renderMapPreview(board: Board, units: readonly PreviewUnit[], theme: ScenarioTheme): string {
  const { width, height } = board;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width > 256 || height > 256) return '';
  const colors = { ...terrainColors, ...themeColors[theme] };
  const tiles: string[] = [];
  const properties: string[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = board.terrain[y]?.[x];
      const kind = tile && Object.hasOwn(colors, tile.kind) ? tile.kind : 'plain';
      tiles.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${colors[kind]}"/>`);
      if (!tile || !propertyKinds.has(kind)) continue;
      const fill = ownerColors[tile.owner === 'red' || tile.owner === 'blue' ? tile.owner : 'neutral'];
      const inset = kind === 'capital' ? 0.1 : 0.22;
      properties.push(`<rect class="map-preview-property" x="${x + inset}" y="${y + inset}" width="${1 - inset * 2}" height="${1 - inset * 2}" fill="${fill}"/>`);
    }
  }
  const dots = units
    .filter((unit) => Number.isInteger(unit.x) && Number.isInteger(unit.y) && unit.x >= 0 && unit.y >= 0 && unit.x < width && unit.y < height)
    .map(
      (unit) =>
        `<circle class="map-preview-unit" cx="${unit.x + 0.5}" cy="${unit.y + 0.5}" r="0.26" fill="${ownerColors[unit.owner === 'blue' ? 'blue' : 'red']}" stroke="#0d1714" stroke-width="0.1"/>`,
    );
  return `<svg class="map-preview" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${tiles.join('')}${properties.join('')}<g shape-rendering="geometricPrecision">${dots.join('')}</g></svg>`;
}
