import { isGroundUnit } from './logistics';
import { defenseStars, samePosition, terrainAt } from './terrain';
import { isDeployedUnit, usesFrontlineRules, type GameResult, type GameState, type Position, type Unit } from './types';

export const FORTIFICATION_COST = 500;
export const MAX_FORTIFICATIONS = 4;

/** A failed order changes neither funds nor action state. */
export function fortificationError(state: GameState, unitId: string): string | undefined {
  if (!usesFrontlineRules(state)) return 'この対局のルールでは設営できません。';
  if (state.winner) return '対局は終了しています。';
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit || !isDeployedUnit(unit) || unit.kind !== 'engineer' || unit.owner !== state.activePlayer) return '自軍の工兵を選択してください。';
  if (unit.hasMoved || unit.hasActed) return '設営には未移動・未行動の工兵が必要です。';
  if (terrainAt(state.board, unit.position)?.kind !== 'plain') return '設営できるのは平原です。';
  if (state.fortifications?.some((site) => samePosition(site.position, unit.position))) return 'この地点には陣地があります。';
  if ((state.fortifications?.filter((site) => site.owner === unit.owner).length ?? 0) >= MAX_FORTIFICATIONS) return '自軍の陣地は4か所までです。';
  if (state.players[unit.owner].gold < FORTIFICATION_COST) return '設営資金500Gが不足しています。';
  return undefined;
}

export function fortifyUnit(state: GameState, unitId: string): GameResult {
  const error = fortificationError(state, unitId);
  if (error) return { ok: false, error };
  const unit = state.units.find((candidate) => candidate.id === unitId)!;
  return {
    ok: true,
    value: {
      ...state,
      fortifications: [...(state.fortifications ?? []), { owner: unit.owner, position: { ...unit.position! } }],
      players: { ...state.players, [unit.owner]: { ...state.players[unit.owner], gold: state.players[unit.owner].gold - FORTIFICATION_COST } },
      units: state.units.map((candidate) => (candidate.id === unitId ? { ...candidate, hasMoved: true, hasActed: true } : candidate)),
    },
  };
}

/** Cover is owned, ground-only, and uses the same HP scaling as terrain. */
export function unitDefenseStars(state: GameState, unit: Unit): number {
  if (!isDeployedUnit(unit)) return 0;
  const terrain = terrainAt(state.board, unit.position);
  const base = terrain ? defenseStars(terrain) : 0;
  const bonus =
    usesFrontlineRules(state) && isGroundUnit(unit.kind) && state.fortifications?.some((site) => site.owner === unit.owner && samePosition(site.position, unit.position)) ? 1 : 0;
  return Math.min(4, base + bonus);
}

/** Ground entry also removes sites along a traversed route, never beyond first contact. */
export function removeEnteredFortifications(state: GameState, unit: Unit, route: readonly Position[]): GameState {
  if (!usesFrontlineRules(state) || !isGroundUnit(unit.kind) || !state.fortifications) return state;
  return { ...state, fortifications: state.fortifications.filter((site) => site.owner === unit.owner || !route.some((position) => samePosition(position, site.position))) };
}

export function validFortifications(state: GameState): boolean {
  const sites: unknown = state.fortifications;
  if (sites === undefined) return true;
  if (!usesFrontlineRules(state) || !Array.isArray(sites) || sites.length > MAX_FORTIFICATIONS * 2) return false;
  const keys = new Set<string>();
  const counts = { red: 0, blue: 0 };
  return sites.every((site: unknown) => {
    if (!site || typeof site !== 'object' || Array.isArray(site)) return false;
    const value = site as Record<string, unknown>;
    if (Object.keys(value).sort().join() !== 'owner,position' || (value.owner !== 'red' && value.owner !== 'blue')) return false;
    const position = value.position as Position | undefined;
    if (
      !position ||
      Object.keys(position).sort().join() !== 'x,y' ||
      !Number.isSafeInteger(position.x) ||
      !Number.isSafeInteger(position.y) ||
      terrainAt(state.board, position)?.kind !== 'plain'
    )
      return false;
    const key = `${position.x},${position.y}`;
    if (keys.has(key) || ++counts[value.owner] > MAX_FORTIFICATIONS) return false;
    keys.add(key);
    return !state.units.some((unit) => isDeployedUnit(unit) && isGroundUnit(unit.kind) && unit.owner !== value.owner && samePosition(unit.position, position));
  });
}
