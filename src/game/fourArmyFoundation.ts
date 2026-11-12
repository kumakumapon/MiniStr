import type { GameResult } from './types';

/** Separate from legacy PlayerId: this contract is not a playable GameState yet. */
export const FOUR_ARMY_IDS = ['army1', 'army2', 'army3', 'army4'] as const;
export type FourArmyId = (typeof FOUR_ARMY_IDS)[number];
export const FOUR_ARMY_SCOPE = Object.freeze({
  contractVersion: 1,
  mode: 'spectate',
  diplomacy: 'free-for-all',
  mapCount: 1,
  boardSize: 32,
  trialUnitsPerArmy: 16,
  trialTotalUnits: 64,
  decisionRound: null,
  spectatorPauseRounds: 100,
} as const);
/** Reserved outer envelopes; no writer/import route is enabled in v1.5.9. */
export const FOUR_ARMY_ARCHIVES = Object.freeze({
  saveFormat: 'ministr-four-army-save',
  replayFormat: 'ministr-four-army-replay',
  schemaVersion: 1,
  ruleset: 'four-army-v1',
  storagePrefix: 'ministr.fourArmy.',
} as const);

export interface FourArmyRound {
  round: number;
  order: FourArmyId[];
  index: number;
  phase: 'pending' | 'active';
  startedArmies: FourArmyId[];
}
export interface FourArmyUnitRef {
  id: string;
  army: FourArmyId;
  carrierId?: string;
}
export interface FourArmyFacilityRef {
  id: string;
  owner?: FourArmyId;
  /** Original home capital, including after its capture or neutralisation. */
  capitalOf?: FourArmyId;
}
export interface FourArmyBattlefield {
  alive: FourArmyId[];
  units: FourArmyUnitRef[];
  facilities: FourArmyFacilityRef[];
}
export type FourArmyOutcome = { type: 'ongoing' } | { type: 'victory'; winner: FourArmyId } | { type: 'draw' };
const fail = (error: string): GameResult<never> => ({ ok: false, error });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const hasKeys = (v: Record<string, unknown>, required: string[], optional: string[] = []): boolean =>
  required.every((k) => Object.hasOwn(v, k)) && Object.keys(v).every((k) => required.includes(k) || optional.includes(k));
const isArmy = (v: unknown): v is FourArmyId => FOUR_ARMY_IDS.some((id) => id === v);
const isArmyList = (v: unknown): v is FourArmyId[] => Array.isArray(v) && v.length <= 4 && v.every(isArmy) && new Set(v).size === v.length;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v);

export function isFourArmyRound(value: unknown): value is FourArmyRound {
  if (!isRecord(value) || !hasKeys(value, ['round', 'order', 'index', 'phase', 'startedArmies'])) return false;
  if (!Number.isSafeInteger(value.round) || (value.round as number) < 1 || !isArmyList(value.order) || value.order.length !== 4) return false;
  if (!Number.isSafeInteger(value.index) || (value.index as number) < 0 || (value.index as number) > 3 || !isArmyList(value.startedArmies)) return false;
  return value.phase === 'pending' || (value.phase === 'active' && value.startedArmies.includes(value.order[value.index as number]!));
}

export function createFourArmyRound(order: readonly FourArmyId[] = FOUR_ARMY_IDS): GameResult<FourArmyRound> {
  if (!isArmyList(order) || order.length !== 4) return fail('4軍の手番順は各軍を1回ずつ指定してください。');
  return { ok: true, value: { round: 1, order: [...order], index: 0, phase: 'pending', startedArmies: [] } };
}

/** A resumed active turn never applies income/upkeep twice. Each army skips its own first standing-fuel charge. */
export function startFourArmyTurn(
  round: FourArmyRound,
  alive: readonly FourArmyId[],
): GameResult<{ round: FourArmyRound; army: FourArmyId; applyStart: boolean; firstTurn: boolean; consumeStandingFuel: boolean }> {
  if (!isFourArmyRound(round) || !isArmyList(alive) || alive.length < 2 || !alive.includes(round.order[round.index]!)) return fail('開始できる4軍手番ではありません。');
  const army = round.order[round.index]!;
  const applyStart = round.phase === 'pending';
  const firstTurn = applyStart && !round.startedArmies.includes(army);
  return {
    ok: true,
    value: {
      round: { ...structuredClone(round), phase: 'active', startedArmies: firstTurn ? [...round.startedArmies, army] : [...round.startedArmies] },
      army,
      applyStart,
      firstTurn,
      consumeStandingFuel: applyStart && !firstTurn,
    },
  };
}

/** Fixed order/cursor, not a surviving colour, determines the round boundary. */
export function finishFourArmyTurn(round: FourArmyRound, alive: readonly FourArmyId[]): GameResult<{ round: FourArmyRound; completedRound?: number }> {
  if (!isFourArmyRound(round) || round.phase !== 'active' || !isArmyList(alive) || alive.length < 2) return fail('終了できる4軍手番ではありません。');
  let index = round.index;
  let wrapped = false;
  for (let steps = 0; steps < 4; steps++) {
    index = (index + 1) % 4;
    if (index === 0) wrapped = true;
    if (!alive.includes(round.order[index]!)) continue;
    if (wrapped && round.round === Number.MAX_SAFE_INTEGER) return fail('ラウンド番号の上限に達しました。');
    return {
      ok: true,
      value: {
        round: { ...structuredClone(round), round: round.round + Number(wrapped), index, phase: 'pending' },
        ...(wrapped ? { completedRound: round.round } : {}),
      },
    };
  }
  return fail('次の生存軍がありません。');
}

/** Reference-only aftermath model: combat, movement and rendering remain the next implementation stage. */
export function isFourArmyBattlefield(value: unknown): value is FourArmyBattlefield {
  if (!isRecord(value) || !hasKeys(value, ['alive', 'units', 'facilities']) || !isArmyList(value.alive)) return false;
  if (!Array.isArray(value.units) || value.units.length > 128 || !Array.isArray(value.facilities) || value.facilities.length > 1024) return false;
  const units: FourArmyUnitRef[] = [];
  for (const unit of value.units) {
    if (!isRecord(unit) || !hasKeys(unit, ['id', 'army'], ['carrierId']) || !isId(unit.id) || !isArmy(unit.army) || !value.alive.includes(unit.army)) return false;
    if (Object.hasOwn(unit, 'carrierId') && !isId(unit.carrierId)) return false;
    units.push(unit as unknown as FourArmyUnitRef);
  }
  if (new Set(units.map((u) => u.id)).size !== units.length) return false;
  if (
    units.some(
      (u) => u.carrierId !== undefined && !units.some((carrier) => carrier.id === u.carrierId && carrier.id !== u.id && carrier.army === u.army && carrier.carrierId === undefined),
    )
  )
    return false;
  const capitals: FourArmyId[] = [];
  const facilityIds: string[] = [];
  for (const facility of value.facilities) {
    if (!isRecord(facility) || !hasKeys(facility, ['id'], ['owner', 'capitalOf']) || !isId(facility.id)) return false;
    if (Object.hasOwn(facility, 'owner') && !isArmy(facility.owner)) return false;
    if (Object.hasOwn(facility, 'capitalOf')) {
      if (!isArmy(facility.capitalOf)) return false;
      capitals.push(facility.capitalOf);
    }
    facilityIds.push(facility.id);
  }
  return capitals.length === 4 && new Set(capitals).size === 4 && new Set(facilityIds).size === facilityIds.length;
}

/** Decide all losses on the same snapshot, then remove armies and decide the result. */
export function resolveFourArmyEliminations(input: unknown): GameResult<{ battlefield: FourArmyBattlefield; outcome: FourArmyOutcome }> {
  if (!isFourArmyBattlefield(input)) return fail('4軍の脱落判定用データが不正です。');
  const alive = FOUR_ARMY_IDS.filter(
    (army) => input.alive.includes(army) && input.units.some((u) => u.army === army) && input.facilities.some((f) => f.capitalOf === army && f.owner === army),
  );
  const battlefield: FourArmyBattlefield = {
    alive,
    units: input.units.filter((u) => alive.includes(u.army)).map((u) => ({ ...u })),
    facilities: input.facilities.map((f) => {
      const { owner, ...rest } = f;
      return owner !== undefined && alive.includes(owner) ? { ...rest, owner } : rest;
    }),
  };
  const outcome: FourArmyOutcome = alive.length === 0 ? { type: 'draw' } : alive.length === 1 ? { type: 'victory', winner: alive[0]! } : { type: 'ongoing' };
  return { ok: true, value: { battlefield, outcome } };
}
