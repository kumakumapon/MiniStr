import type { Position } from './types';
/** Canonical orientation of the fixed square four-army board, using the public home. */
export function homePositionRank(home: Position, p: Position): number {
  const right = home.x >= 16,
    bottom = home.y >= 16;
  const q = right ? (bottom ? { x: 31 - p.x, y: 31 - p.y } : { x: p.y, y: 31 - p.x }) : bottom ? { x: 31 - p.y, y: p.x } : p;
  return q.y * 32 + q.x;
}
