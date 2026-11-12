import { isGameState } from '../game/session';
import { visiblePositions } from '../game/fog';
import { FOUR_ARMY_IDS, isFourArmyRound } from '../game/fourArmyFoundation';
import { isPropertyTerrainKind } from '../game/facilities';
import { positionKey } from '../game/terrain';
import { unitStats } from '../game/units';
import type { FourArmyObservation } from '../game/fourArmyEngine';
import type { GameState, Position } from '../game/types';

export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const exactKeys = (v: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) =>
  required.every((k) => Object.hasOwn(v, k)) && Object.keys(v).every((k) => required.includes(k) || optional.includes(k));
export const boundedInt = (v: unknown, min = 0, max = 1_000_000_000): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const isArmy = (v: unknown) => FOUR_ARMY_IDS.some((a) => a === v);
const position = (v: unknown): v is Position => record(v) && exactKeys(v, ['x', 'y']) && boundedInt(v.x, 0, 31) && boundedInt(v.y, 0, 31);

/** Observations only: no full-state overload and no access to the real combat RNG or other armies' funds. */
export function fourArmyPlanningView(o: FourArmyObservation): GameState {
  return {
    board: { ...o.board, terrain: o.board.terrain.map((row) => row.map((t) => ({ ...t, owner: t.owner === undefined ? undefined : t.owner === o.viewer ? 'red' : 'blue' }))) },
    units: o.units.map((u) => ({ ...u, owner: u.owner === o.viewer ? 'red' : 'blue' })),
    players: { red: { ...o.player }, blue: { gold: 0, income: 0 } },
    activePlayer: 'red',
    turn: o.round.round,
    ruleVersion: 12,
    rngSeed: 0,
    nextUnitId: Math.max(0, ...o.units.map((u) => (/^u[0-9]+$/.test(u.id) ? Number(u.id.slice(1)) : 0))) + 1,
  };
}

export function isFourArmyObservation(v: unknown): v is FourArmyObservation {
  if (!record(v) || !exactKeys(v, ['viewer', 'board', 'capitals', 'units', 'player', 'visible', 'round', 'alive', 'outcome']) || !isArmy(v.viewer)) return false;
  const b = v.board,
    caps = v.capitals,
    p = v.player,
    alive = v.alive;
  if (
    !record(b) ||
    !exactKeys(b, ['width', 'height', 'terrain']) ||
    !boundedInt(b.width, 2, 32) ||
    !boundedInt(b.height, 2, 32) ||
    !Array.isArray(b.terrain) ||
    b.terrain.length !== b.height
  )
    return false;
  if (!Array.isArray(alive) || alive.length > 4 || !alive.every(isArmy) || new Set(alive).size !== alive.length) return false;
  if (!record(caps) || !exactKeys(caps, FOUR_ARMY_IDS) || !FOUR_ARMY_IDS.every((a) => position(caps[a]))) return false;
  if (new Set(Object.values(caps).map((p) => positionKey(p as Position))).size !== 4) return false;
  if (
    !record(p) ||
    !exactKeys(p, ['gold', 'income']) ||
    !boundedInt(p.gold, 0, 1e12) ||
    !boundedInt(p.income, 0, 1_024_000) ||
    !isFourArmyRound(v.round) ||
    !boundedInt(v.round.round, 1, 1_000_000)
  )
    return false;
  if (
    !record(v.outcome) ||
    !exactKeys(v.outcome, v.outcome.type === 'victory' ? ['type', 'winner'] : ['type']) ||
    !['ongoing', 'victory', 'draw'].some((t) => t === (v.outcome as Record<string, unknown>).type)
  )
    return false;
  if (
    (v.outcome.type === 'victory' && (!isArmy(v.outcome.winner) || alive.length !== 1 || alive[0] !== v.outcome.winner)) ||
    (v.outcome.type === 'draw' && alive.length !== 0) ||
    (v.outcome.type === 'ongoing' && alive.length < 2)
  )
    return false;
  const o = v as unknown as FourArmyObservation;
  if (
    !o.board.terrain.every(
      (row) =>
        Array.isArray(row) &&
        row.length === o.board.width &&
        row.every(
          (t) =>
            record(t) &&
            exactKeys(t, ['kind'], ['owner', 'capturePoints']) &&
            (t.owner === undefined || (isArmy(t.owner) && o.alive.includes(t.owner) && isPropertyTerrainKind(t.kind))),
        ),
    )
  )
    return false;
  if (
    o.board.terrain.flat().filter((t) => t.kind === 'capital').length !== 4 ||
    !FOUR_ARMY_IDS.every((a) => o.board.terrain[o.capitals[a].y]?.[o.capitals[a].x]?.kind === 'capital')
  )
    return false;
  if (!Array.isArray(o.units) || o.units.length > 128 || !o.units.every(record)) return false;
  if (
    !o.units.every(
      (u) =>
        exactKeys(u, ['id', 'kind', 'owner', 'hp', 'hasMoved', 'hasActed'], ['position', 'embarkedIn', 'fuel', 'ammo', 'secondaryAmmo', 'supplyStock', 'experience']) &&
        typeof u.id === 'string' &&
        /^[A-Za-z0-9_-]{1,80}$/.test(u.id) &&
        isArmy(u.owner) &&
        o.alive.includes(u.owner) &&
        boundedInt(u.hp, 1, 100) &&
        (u.position === undefined || position(u.position)) &&
        (u.embarkedIn === undefined || o.units.some((c) => c.id === u.embarkedIn && c.owner === u.owner)) &&
        (u.owner === o.viewer ||
          (u.position !== undefined && u.embarkedIn === undefined && u.supplyStock === undefined && u.secondaryAmmo === undefined && u.hasMoved === false && u.hasActed === false)),
    )
  )
    return false;
  const view = fourArmyPlanningView(o);
  if (!isGameState(view) || !boundedInt(view.nextUnitId, 1, 1e9)) return false;
  if (
    o.units.some(
      (u) =>
        (u.fuel !== undefined && !boundedInt(u.fuel, 0, unitStats[u.kind].fuel)) ||
        (u.owner !== o.viewer && (u.fuel !== unitStats[u.kind].fuel || u.ammo !== unitStats[u.kind].ammo)),
    )
  )
    return false;
  if (!Array.isArray(o.visible) || o.visible.length > 1024 || !o.visible.every(position)) return false;
  const expected = new Set(visiblePositions(view, 'red').map(positionKey)),
    actual = new Set(o.visible.map(positionKey));
  if (actual.size !== o.visible.length || actual.size !== expected.size || [...actual].some((k) => !expected.has(k))) return false;
  if (o.units.some((u) => u.owner !== o.viewer && (!u.position || !expected.has(positionKey(u.position))))) return false;
  return o.board.terrain.every((row, y) => row.every((t, x) => expected.has(`${x},${y}`) || t.capturePoints === undefined || t.capturePoints === 20));
}
