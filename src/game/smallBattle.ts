import { isAsymmetricSource, type AsymmetricSource } from './asymmetricBattlefield';
import { FOUR_ARMY_IDS, type FourArmyId, type FourArmyOutcome } from './fourArmyFoundation';
import type { FourArmyMap, FourArmyState } from './fourArmyEngine';
import { isPropertyTerrainKind } from './facilities';
import type { Position } from './types';

/** Immutable contract of the authored compact variants; absent on all legacy games. */
export interface LegacySmallBattle {
  version: 1;
  sourceMapId: 'skirmish';
  layoutVersion: 1;
  participants: FourArmyId[];
  ending: 'short' | 'unlimited';
  roundLimit?: 20;
}
export interface ExpandedBattle {
  version: 2;
  sourceMapId: 'skirmish' | 'outpost' | 'strait' | 'frontier' | AsymmetricSource;
  layoutVersion: 2 | 3 | 4;
  /** Army assigned to each ordered authored site in layout 4. */
  siteArmies?: FourArmyId[];
  participants: FourArmyId[];
  initialOrder: FourArmyId[];
  initiative: 'fixed' | 'rotating';
  ending: 'short' | 'unlimited';
  roundLimit?: 20 | 21;
  teams: Record<FourArmyId, FourArmyId>;
  sharedVision: boolean;
}
export type SmallBattle = LegacySmallBattle | ExpandedBattle;
export const alliedArmies = (match: SmallBattle | undefined, a: FourArmyId, b: FourArmyId): boolean =>
  a === b || (match?.version === 2 && match.participants.includes(a) && match.participants.includes(b) && match.teams[a] === match.teams[b]);
export const matchTeams = (match?: SmallBattle) => (match?.version === 2 ? match.teams : undefined);
export function battleWinners(s: Pick<FourArmyState, 'match' | 'outcome'>): FourArmyId[] {
  return s.outcome.type === 'victory' ? fourArmyParticipants(s).filter((a) => alliedArmies(s.match, a, s.outcome.type === 'victory' ? s.outcome.winner : a)) : [];
}
export function battleOrder(match: ExpandedBattle, round: number): FourArmyId[] {
  const offset = match.initiative === 'rotating' ? (round - 1) % match.participants.length : 0;
  return [...match.initialOrder.slice(offset), ...match.initialOrder.slice(0, offset)];
}
export const fourArmyParticipants = (v: { match?: SmallBattle }): readonly FourArmyId[] => v.match?.participants ?? FOUR_ARMY_IDS;
export function isSmallBattle(v: unknown): v is SmallBattle {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const m = v as Record<string, unknown>,
    expected = ['version', 'sourceMapId', 'layoutVersion', 'participants', 'ending', ...(m.ending === 'short' ? ['roundLimit'] : [])];
  if (m.version === 2) {
    const authored = isAsymmetricSource(m.sourceMapId);
    const names = [...expected, ...(authored ? ['siteArmies'] : []), 'initialOrder', 'initiative', 'teams', 'sharedVision'];
    const ids = m.participants;
    if (
      Object.keys(m).length !== names.length ||
      !names.every((k) => Object.hasOwn(m, k)) ||
      (authored
        ? m.layoutVersion !== 4
        : m.layoutVersion !== 2 && !(m.layoutVersion === 3 && Array.isArray(ids) && ids.length === 3 && ['skirmish', 'outpost'].includes(String(m.sourceMapId)))) ||
      (!authored && !['skirmish', 'outpost', 'strait', 'frontier'].includes(String(m.sourceMapId))) ||
      !Array.isArray(ids) ||
      ids.length < 2 ||
      ids.length > 4 ||
      !ids.every((a, i) => FOUR_ARMY_IDS.includes(a) && (i === 0 || FOUR_ARMY_IDS.indexOf(a) > FOUR_ARMY_IDS.indexOf(ids[i - 1]))) ||
      !Array.isArray(m.initialOrder) ||
      m.initialOrder.length !== ids.length ||
      new Set(m.initialOrder).size !== ids.length ||
      !m.initialOrder.every((a) => ids.includes(a)) ||
      !['fixed', 'rotating'].includes(String(m.initiative)) ||
      (ids.length === 2 && m.initiative !== 'fixed') ||
      typeof m.sharedVision !== 'boolean' ||
      !m.teams ||
      typeof m.teams !== 'object' ||
      Array.isArray(m.teams) ||
      Object.keys(m.teams).length !== ids.length
    )
      return false;
    const teams = m.teams as Record<string, unknown>;
    if (
      authored &&
      (ids.length < 3 ||
        !Array.isArray(m.siteArmies) ||
        m.siteArmies.length !== ids.length ||
        new Set(m.siteArmies).size !== ids.length ||
        !m.siteArmies.every((a) => ids.includes(a)) ||
        ids.some((a) => teams[a] !== a))
    )
      return false;
    if (!ids.every((a) => Object.hasOwn(teams, a) && FOUR_ARMY_IDS.includes(teams[a] as FourArmyId)) || new Set(Object.values(teams)).size < 2) return false;
    if (new Set(Object.values(teams)).size < ids.length && !m.sharedVision) return false;
    return m.ending === 'unlimited' || (m.ending === 'short' && m.roundLimit === (ids.length === 3 ? 21 : 20));
  }
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
  if (s.match?.version === 2) {
    const groups = new Map<FourArmyId, { army: FourArmyId; properties: number; hp: number }>();
    for (const row of smallBattleStandings(s).filter((r) => r.alive)) {
      const team = s.match.teams[row.army],
        old = groups.get(team);
      groups.set(team, { army: old?.army ?? row.army, properties: (old?.properties ?? 0) + row.properties, hp: (old?.hp ?? 0) + row.hp });
    }
    const rows = [...groups.values()].sort((a, b) => b.properties - a.properties || b.hp - a.hp),
      first = rows[0],
      second = rows[1];
    return first && (!second || first.properties !== second.properties || first.hp !== second.hp) ? { type: 'victory', winner: first.army } : { type: 'draw' };
  }
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
  if (m.match?.version === 2)
    return (
      isSmallBattle(m.match) &&
      m.pathVersion === 3 &&
      !!m.board &&
      m.board.width === (m.match.sourceMapId === 'frontier' ? 32 : m.match.sourceMapId === 'strait' ? 17 : 18) &&
      m.board.height === (m.match.sourceMapId === 'frontier' ? 32 : m.match.sourceMapId === 'strait' ? 15 : 14) &&
      m.id === `${m.match.sourceMapId}-multi-${m.match.participants.join('-')}-v${m.match.layoutVersion}`
    );
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
