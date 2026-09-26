import { isPropertyTerrainKind, type Terrain } from '../game';

/**
 * What the viewer may know about a property's capture progress (#125).
 * - a number: the tile is visible, so the actual value is shown;
 * - 'unknown': the tile is in fog. Capture progress below 20 means an enemy
 *   unit is standing there, so it is withheld for every owner, including the
 *   viewer's own properties (properties do not grant vision here);
 * - undefined: not a property, or a visible property without a value.
 * Whether a tile is visible is the viewer's public knowledge, so showing
 * 'unknown' reveals nothing by itself.
 */
export function observedCapturePoints(tile: Terrain, visible: boolean): number | 'unknown' | undefined {
  if (!isPropertyTerrainKind(tile.kind)) return undefined;
  return visible ? tile.capturePoints : 'unknown';
}

export function capturePointsLabel(value: number | 'unknown'): string {
  return value === 'unknown' ? '不明' : `${value}`;
}
