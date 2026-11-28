import { authoredBattlefield, isAuthoredFourSource } from './asymmetricFourSites';
import type { FourArmyMap, FourArmyObservation, FourArmyState, FourArmyUnit } from './fourArmyEngine';
import type { FourArmyId } from './fourArmyFoundation';
import { inFourArmyStartZone, type FourArmyStartZone } from './fourArmySetup';
import type { SmallBattle } from './smallBattle';
import type { Position, UnitKind } from './types';
import { unitStats } from './units';
import { weaponsForUnit } from './weapons';

export interface FourArmyArrival {
  army: FourArmyId;
  team: FourArmyId;
  round: number;
  zone: FourArmyStartZone;
  capital: Position;
  gold: number;
  units: { kind: UnitKind; position: Position }[];
  facilities: { kind: 'factory' | 'city' | 'airport' | 'port'; position: Position }[];
}

export function authoredArrival(source: unknown, sites: readonly FourArmyId[]): FourArmyArrival | undefined {
  if (!isAuthoredFourSource(source)) return undefined;
  const spec = authoredBattlefield(source);
  const schedule = spec.arrival;
  if (!schedule || !sites[schedule.site]) return undefined;
  const army = sites[schedule.site]!;
  const assets = spec.sites[schedule.site]!;
  return {
    army,
    team: army,
    round: schedule.round,
    zone: { ...schedule.zone },
    capital: { ...schedule.capital },
    gold: assets.gold,
    units: assets.units.map(([kind, x, y]) => ({ kind, position: { x, y } })),
    facilities: assets.facilities.map(([kind, x, y]) => ({ kind, position: { x, y } })),
  };
}

export const fourArmyArrival = (match?: SmallBattle): FourArmyArrival | undefined => (match?.version === 3 ? match.arrival : undefined);

export function isCanonicalArrival(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== 'object') return actual === expected;
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual) !== Array.isArray(expected)) return false;
  const left = actual as Record<string, unknown>;
  const right = expected as Record<string, unknown>;
  const keys = Object.keys(right);
  return Object.keys(left).length === keys.length && keys.every((key) => Object.hasOwn(left, key) && isCanonicalArrival(left[key], right[key]));
}

export function earlierArmies(map: Pick<FourArmyMap, 'match' | 'order'>): FourArmyId[] {
  const reserve = fourArmyArrival(map.match);
  return reserve ? map.order.filter((army) => army !== reserve.army) : map.order;
}

export function withoutReserve(map: FourArmyMap): FourArmyMap {
  const reserve = fourArmyArrival(map.match);
  if (!reserve) return map;
  return {
    ...map,
    units: map.units.filter((unit) => unit.owner !== reserve.army),
    players: { ...map.players, [reserve.army]: { gold: 0, income: 0 } },
    board: {
      ...map.board,
      terrain: map.board.terrain.map((row) => row.map((tile) => (tile.owner === reserve.army ? { kind: tile.kind, capturePoints: 20 } : tile))),
    },
  };
}

/** The end of the previous round is the only place an eligible army can arrive. */
export function enterReservedArmy(state: FourArmyState, nextRound: number): FourArmyState {
  const reserve = fourArmyArrival(state.match);
  if (!reserve || state.arrivedAt !== undefined || nextRound < reserve.round || state.outcome.type !== 'ongoing') return state;
  const blocked =
    state.units.some((unit) => unit.position && inFourArmyStartZone(unit.position, reserve.zone)) ||
    state.board.terrain.some((row, y) => row.some((tile, x) => tile.owner !== undefined && inFourArmyStartZone({ x, y }, reserve.zone)));
  if (blocked) return state;
  const terrain = state.board.terrain.map((row) => row.slice());
  for (const {
    kind,
    position: { x, y },
  } of [...reserve.facilities, { kind: 'capital' as const, position: reserve.capital }])
    terrain[y]![x] = { kind, owner: reserve.army, capturePoints: 20 };
  const units: FourArmyUnit[] = reserve.units.map(({ kind, position }, index) => {
    const stats = unitStats[kind];
    const secondary = weaponsForUnit(kind, { ruleVersion: 12 })[1];
    return {
      id: 'u' + (state.nextUnitId + index),
      owner: reserve.army,
      kind,
      position,
      hp: 100,
      fuel: stats.fuel,
      ammo: stats.ammo,
      ...(secondary ? { secondaryAmmo: secondary.ammo } : {}),
      hasMoved: false,
      hasActed: false,
    };
  });
  return {
    ...state,
    alive: state.match!.participants.filter((army) => army === reserve.army || state.alive.includes(army)),
    arrivedAt: nextRound,
    board: { ...state.board, terrain },
    players: { ...state.players, [reserve.army]: { gold: reserve.gold, income: 0 } },
    units: [...state.units, ...units],
    nextUnitId: state.nextUnitId + units.length,
  };
}

export function validArrivalProgress(state: Pick<FourArmyState | FourArmyObservation, 'match' | 'round' | 'alive' | 'arrivedAt'>): boolean {
  const reserve = fourArmyArrival(state.match);
  if (!reserve) return !Object.hasOwn(state, 'arrivedAt');
  if (state.arrivedAt === undefined) return !Object.hasOwn(state, 'arrivedAt') && !state.alive.includes(reserve.army) && !state.round.startedArmies.includes(reserve.army);
  return Number.isInteger(state.arrivedAt) && state.arrivedAt >= reserve.round && state.arrivedAt <= state.round.round;
}
