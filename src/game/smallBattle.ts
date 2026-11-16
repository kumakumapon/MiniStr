import { FOUR_ARMY_IDS, type FourArmyId, type FourArmyOutcome } from './fourArmyFoundation';
import type { FourArmyMap, FourArmyState } from './fourArmyEngine';
import { isPropertyTerrainKind } from './facilities';
import type { Position } from './types';

/** Immutable contract of the authored compact variants; absent on all legacy games. */
export interface SmallBattle {
  version: 1;
  sourceMapId: 'skirmish';
  layoutVersion: 1;
  participants: FourArmyId[];
  ending: 'short' | 'unlimited';
  roundLimit?: 20;
}
export const fourArmyParticipants = (v: { match?: SmallBattle }): readonly FourArmyId[] => v.match?.participants ?? FOUR_ARMY_IDS;
export function isSmallBattle(v: unknown): v is SmallBattle {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const m = v as Record<string, unknown>,
    expected = ['version', 'sourceMapId', 'layoutVersion', 'participants', 'ending', ...(m.ending === 'short' ? ['roundLimit'] : [])];
  return (
    Object.keys(m).length === expected.length &&
    expected.every((k) => Object.hasOwn(m, k)) &&
    m.version === 1 &&
    m.sourceMapId === 'skirmish' &&
    m.layoutVersion === 1 &&
    Array.isArray(m.participants) &&
    [3, 4].includes(m.participants.length) &&
    m.participants.every((a, i) => a === FOUR_ARMY_IDS[i]) &&
    (m.ending === 'unlimited' || (m.ending === 'short' && m.roundLimit === 20))
  );
}
/** Mirroring works for rectangles and triangular starts without square-only rotation. */
export function smallBattlePositionRank(board: { width: number; height: number }, home: Position, p: Position, triangular = false): number {
  if (triangular) {
    const left = home.x,
      right = board.width - 1 - home.x,
      top = home.y;
    const local = (v: Position) => (top <= left && top <= right ? v : left < right ? { x: board.height - 1 - v.y, y: v.x } : { x: v.y, y: board.width - 1 - v.x });
    const q = local(p),
      h = local(home);
    // Common origin and fixed-width positive keys: JSON key ordering must not favor an edge's digit count.
    return (q.y - h.y + 32) * 64 + q.x - h.x + 32;
  }
  const x = home.x >= board.width / 2 ? board.width - 1 - p.x : p.x;
  const y = home.y >= board.height / 2 ? board.height - 1 - p.y : p.y;
  return y * board.width + x;
}
export function smallBattleStandings(s: Pick<FourArmyState, 'match' | 'alive' | 'board' | 'units'>) {
  return fourArmyParticipants(s)
    .map((army) => ({
      army,
      alive: s.alive.includes(army),
      properties: s.board.terrain.flat().filter((t) => t.owner === army && isPropertyTerrainKind(t.kind)).length,
      hp: s.units.filter((u) => u.owner === army).reduce((sum, u) => sum + u.hp, 0),
    }))
    .sort((a, b) => Number(b.alive) - Number(a.alive) || b.properties - a.properties || b.hp - a.hp);
}
export function smallBattleDecision(s: Pick<FourArmyState, 'match' | 'alive' | 'board' | 'units'>): FourArmyOutcome {
  const rows = smallBattleStandings(s).filter((r) => r.alive),
    first = rows[0],
    second = rows[1];
  return first && (!second || first.properties !== second.properties || first.hp !== second.hp) ? { type: 'victory', winner: first.army } : { type: 'draw' };
}
/** Only the active roster is materialized; FourArmyId remains the four-slot identity capacity. */
export function fourArmyRoster<T>(ids: readonly FourArmyId[], make: (id: FourArmyId, index: number) => T): Record<FourArmyId, T> {
  return Object.fromEntries(ids.map((id, i) => [id, make(id, i)])) as Record<FourArmyId, T>;
}
export function smallBattleMapShape(m: FourArmyMap): boolean {
  return (
    !!m.match &&
    isSmallBattle(m.match) &&
    !!m.board &&
    typeof m.board === 'object' &&
    m.board.width === 18 &&
    m.board.height === 14 &&
    m.id === `skirmish-ffa${m.match.participants.length}-v1` &&
    m.pathVersion === 2
  );
}
