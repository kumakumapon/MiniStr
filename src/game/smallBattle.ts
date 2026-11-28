import { authoredArrival, isCanonicalArrival, fourArmyArrival, type FourArmyArrival } from './fourArmyArrival';
import type { FourArmyHoldObjective } from './fourArmyObjective';
import { authoredBattlefield, isAuthoredFourSource } from './asymmetricFourSites';
import { encirclementAllianceLimit, isAsymmetricSource, isFixedFourArmySource, siteTeam, type AsymmetricSource } from './asymmetricBattlefield';
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
  version: 2 | 3;
  arrival?: FourArmyArrival;
  sourceMapId: 'skirmish' | 'outpost' | 'strait' | 'frontier' | AsymmetricSource;
  layoutVersion: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  objective?: FourArmyHoldObjective;
  /** Army assigned to each ordered authored site in authored layouts. */
  siteArmies?: FourArmyId[];
  participants: FourArmyId[];
  initialOrder: FourArmyId[];
  initiative: 'fixed' | 'rotating';
  ending: 'short' | 'unlimited';
  roundLimit?: 15 | 20 | 21;
  teams: Record<FourArmyId, FourArmyId>;
  sharedVision: boolean;
}
export type SmallBattle = LegacySmallBattle | ExpandedBattle;
export const isExpandedBattle = (match?: SmallBattle): match is ExpandedBattle => match?.version === 2 || match?.version === 3;
export const alliedArmies = (match: SmallBattle | undefined, a: FourArmyId, b: FourArmyId): boolean =>
  a === b || (isExpandedBattle(match) && match.participants.includes(a) && match.participants.includes(b) && match.teams[a] === match.teams[b]);
/** The Encirclement roster shares a base limit, with lower ceilings at the three allied sites. */
export function fourArmyUnitLimit(match: SmallBattle | undefined, limit: number, army: FourArmyId): number {
  return isExpandedBattle(match) && match.sourceMapId === 'encirclement' && match.siteArmies?.[0] !== army ? Math.min(limit, encirclementAllianceLimit) : limit;
}
export const matchTeams = (match?: SmallBattle) => (isExpandedBattle(match) ? match.teams : undefined);
export function battleWinners(s: Pick<FourArmyState, 'match' | 'outcome'>): FourArmyId[] {
  return s.outcome.type === 'victory' ? fourArmyParticipants(s).filter((a) => alliedArmies(s.match, a, s.outcome.type === 'victory' ? s.outcome.winner : a)) : [];
}
export function battleOrder(match: ExpandedBattle, round: number, arrivedAt?: number): FourArmyId[] {
  const reserve = fourArmyArrival(match);
  const pending = reserve && (arrivedAt === undefined || round < arrivedAt) ? reserve.army : undefined;
  const order = pending ? match.initialOrder.filter((army) => army !== pending) : match.initialOrder;
  const offset = match.initiative === 'rotating' ? (round - 1) % order.length : 0;
  return [...order.slice(offset), ...order.slice(0, offset), ...(pending ? [pending] : [])];
}
export const fourArmyParticipants = (v: { match?: SmallBattle }): readonly FourArmyId[] => v.match?.participants ?? FOUR_ARMY_IDS;
function exactHoldObjective(value: unknown, expected: FourArmyHoldObjective): boolean {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<FourArmyHoldObjective>;
  return (
    Object.keys(v).length === 3 &&
    v.type === 'hold' &&
    v.rounds === expected.rounds &&
    !!v.position &&
    typeof v.position === 'object' &&
    Object.keys(v.position).length === 2 &&
    v.position.x === expected.position.x &&
    v.position.y === expected.position.y
  );
}
export function isSmallBattle(v: unknown): v is SmallBattle {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const m = v as Record<string, unknown>,
    expected = ['version', 'sourceMapId', 'layoutVersion', 'participants', 'ending', ...(m.ending === 'short' ? ['roundLimit'] : [])];
  if (m.version === 2 || m.version === 3) {
    const authored = isAsymmetricSource(m.sourceMapId);
    const objective = isAuthoredFourSource(m.sourceMapId) ? authoredBattlefield(m.sourceMapId).objective : undefined;
    const reserve = isAuthoredFourSource(m.sourceMapId) ? authoredBattlefield(m.sourceMapId).arrival : undefined;
    if ((m.version === 3) !== !!reserve) return false;
    const names = [
      ...expected,
      ...(authored ? ['siteArmies'] : []),
      ...(objective ? ['objective'] : []),
      ...(reserve ? ['arrival'] : []),
      'initialOrder',
      'initiative',
      'teams',
      'sharedVision',
    ];
    const ids = m.participants;
    if (
      Object.keys(m).length !== names.length ||
      !names.every((k) => Object.hasOwn(m, k)) ||
      (objective !== undefined && !exactHoldObjective(m.objective, objective)) ||
      (isFixedFourArmySource(m.sourceMapId)
        ? m.layoutVersion !== (reserve ? 10 : objective ? 9 : isAuthoredFourSource(m.sourceMapId) ? 8 : m.sourceMapId === 'encirclement' ? 7 : 6) ||
          !Array.isArray(ids) ||
          ids.length !== 4 ||
          m.initiative !== 'rotating' ||
          m.sharedVision !== (isAuthoredFourSource(m.sourceMapId) ? authoredBattlefield(m.sourceMapId).teams !== undefined : m.sourceMapId === 'encirclement')
        : authored
          ? m.layoutVersion !== 5 && !(m.layoutVersion === 4 && (m.sourceMapId === 'canyon' || m.sourceMapId === 'marsh'))
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
        (reserve !== undefined && !isCanonicalArrival(m.arrival, authoredArrival(m.sourceMapId, m.siteArmies))) ||
        (m.sourceMapId === 'tundra' && (ids.length !== 3 || m.ending !== 'short')) ||
        !m.siteArmies.every((army, _, sites) => teams[army] === siteTeam(m.sourceMapId as AsymmetricSource, sites, army)))
    )
      return false;
    if (!ids.every((a) => Object.hasOwn(teams, a) && FOUR_ARMY_IDS.includes(teams[a] as FourArmyId)) || new Set(Object.values(teams)).size < 2) return false;
    if (new Set(Object.values(teams)).size < ids.length && !m.sharedVision) return false;
    return m.ending === 'unlimited' || (m.ending === 'short' && m.roundLimit === (m.sourceMapId === 'tundra' ? 15 : ids.length === 3 ? 21 : 20));
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
  if (isExpandedBattle(s.match)) {
    if (s.match.sourceMapId === 'tundra') return { type: 'victory', winner: s.match.siteArmies![0]! };
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
  if (isExpandedBattle(m.match))
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
