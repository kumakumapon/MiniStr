import { visiblePositions } from './fog';
import { movementCost, samePosition, terrainAt } from './terrain';
import { isDeployedUnit, STRATEGY_RULE_VERSION, usesBridgeRules, type Board, type GameResult, type GameState, type Position } from './types';

export const BRIDGE_COST = 1000;
export const MAX_BRIDGES = 2;

/** Public failure text never distinguishes a hidden occupant from an unavailable site. */
export function destroyBridgeError(state: GameState, unitId: string, destination: Position): string | undefined {
  const unavailable = 'この地点の橋は破壊できません。';
  if ((state.ruleVersion ?? 0) < STRATEGY_RULE_VERSION || state.winner) return unavailable;
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit || !isDeployedUnit(unit) || unit.kind !== 'engineer' || unit.owner !== state.activePlayer || unit.hasMoved || unit.hasActed) return unavailable;
  if (!Number.isSafeInteger(destination.x) || !Number.isSafeInteger(destination.y) || Math.abs(unit.position.x - destination.x) + Math.abs(unit.position.y - destination.y) !== 1)
    return unavailable;
  if (!state.bridges?.some((site) => samePosition(site.position, destination))) return unavailable;
  if (!visiblePositions(state, unit.owner).some((position) => samePosition(position, destination))) return unavailable;
  if (state.units.some((candidate) => isDeployedUnit(candidate) && samePosition(candidate.position, destination))) return unavailable;
  return undefined;
}

/** No refund; removing a vacant crossing consumes the engineer's complete action. */
export function destroyBridge(state: GameState, unitId: string, destination: Position): GameResult {
  const error = destroyBridgeError(state, unitId, destination);
  if (error) return { ok: false, error };
  return {
    ok: true,
    value: {
      ...state,
      bridges: state.bridges!.filter((site) => !samePosition(site.position, destination)),
      units: state.units.map((unit) => (unit.id === unitId ? { ...unit, hasMoved: true, hasActed: true } : unit)),
    },
  };
}

/** Banks must be original land passable by both infantry and vehicles; bridges cannot be chained. */
export function bridgeBanks(board: Board, position: Position): Position[] {
  if (!Number.isSafeInteger(position.x) || !Number.isSafeInteger(position.y) || terrainAt(board, position)?.kind !== 'sea') return [];
  const pairs = [
    [
      { x: position.x - 1, y: position.y },
      { x: position.x + 1, y: position.y },
    ],
    [
      { x: position.x, y: position.y - 1 },
      { x: position.x, y: position.y + 1 },
    ],
  ];
  return pairs.filter((pair) => pair.every((bank) => Number.isFinite(movementCost(board, bank, 'tank')))).flat();
}

export function bridgeError(state: GameState, unitId: string, destination?: Position): string | undefined {
  if (!usesBridgeRules(state)) return 'この対局のルールでは架橋できません。';
  if (state.winner) return '対局は終了しています。';
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit || !isDeployedUnit(unit) || unit.kind !== 'engineer' || unit.owner !== state.activePlayer) return '自軍の工兵を選択してください。';
  if (unit.hasMoved || unit.hasActed) return '架橋には未移動・未行動の工兵が必要です。';
  if ((state.bridges?.filter((site) => site.owner === unit.owner).length ?? 0) >= MAX_BRIDGES) return '自軍が建設できる橋は2か所までです。';
  if (state.players[unit.owner].gold < BRIDGE_COST) return '架橋資金1000Gが不足しています。';
  if (destination === undefined) return undefined;
  if (!bridgeBanks(state.board, destination).some((bank) => samePosition(bank, unit.position))) return '向かい合う岸の間の、隣接する1マス幅の水域を選んでください。';
  if (!visiblePositions(state, unit.owner).some((position) => samePosition(position, destination))) return '建設先を索敵してください。';
  if (state.bridges?.some((site) => samePosition(site.position, destination))) return 'この地点には橋があります。';
  if (state.units.some((candidate) => isDeployedUnit(candidate) && samePosition(candidate.position, destination))) return '部隊がいる地点には架橋できません。';
  return undefined;
}

export function bridgeDestinations(state: GameState, unitId: string): Position[] {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit || !isDeployedUnit(unit) || bridgeError(state, unitId)) return [];
  return [
    { x: unit.position.x - 1, y: unit.position.y },
    { x: unit.position.x + 1, y: unit.position.y },
    { x: unit.position.x, y: unit.position.y - 1 },
    { x: unit.position.x, y: unit.position.y + 1 },
  ].filter((position) => !bridgeError(state, unitId, position));
}

export function buildBridge(state: GameState, unitId: string, destination: Position): GameResult {
  const error = bridgeError(state, unitId, destination);
  if (error) return { ok: false, error };
  const owner = state.activePlayer;
  return {
    ok: true,
    value: {
      ...state,
      bridges: [...(state.bridges ?? []), { owner, position: { ...destination } }],
      players: { ...state.players, [owner]: { ...state.players[owner], gold: state.players[owner].gold - BRIDGE_COST } },
      units: state.units.map((unit) => (unit.id === unitId ? { ...unit, hasMoved: true, hasActed: true } : unit)),
    },
  };
}

export function validBridges(state: GameState): boolean {
  const sites: unknown = state.bridges;
  if (sites === undefined) return true;
  if (!usesBridgeRules(state) || !Array.isArray(sites) || sites.length > MAX_BRIDGES * 2) return false;
  const keys = new Set<string>(),
    counts = { red: 0, blue: 0 };
  return sites.every((site: unknown) => {
    if (!site || typeof site !== 'object' || Array.isArray(site)) return false;
    const value = site as Record<string, unknown>;
    if (Object.keys(value).sort().join() !== 'owner,position' || (value.owner !== 'red' && value.owner !== 'blue')) return false;
    const position = value.position as Position | undefined;
    if (!position || Object.keys(position).sort().join() !== 'x,y' || !bridgeBanks(state.board, position).length) return false;
    const key = `${position.x},${position.y}`;
    if (keys.has(key) || ++counts[value.owner] > MAX_BRIDGES) return false;
    keys.add(key);
    return true;
  });
}

/** Candidate water cells are public terrain. No units or fog-dependent information is read. */
export function bridgeSites(board: Board): Position[] {
  return board.terrain.flatMap((row, y) => row.flatMap((tile, x) => (tile.kind === 'sea' && bridgeBanks(board, { x, y }).length ? [{ x, y }] : [])));
}
