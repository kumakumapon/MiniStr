import { usesReconRules, type GameResult, type GameState, type PlayerId, type Position } from './types';

export const RECON_USES = 2;
export const RECON_RADIUS = 3;
export const remainingRecon = (state: GameState, player: PlayerId): number => (usesReconRules(state) ? (state.recon?.remaining[player] ?? RECON_USES) : 0);

export function scanArea(state: GameState, center: Position): GameResult {
  if (!usesReconRules(state) || state.winner || remainingRecon(state, state.activePlayer) <= 0) return { ok: false, error: '広域偵察を実行できません。' };
  if (!Number.isSafeInteger(center.x) || !Number.isSafeInteger(center.y) || center.x < 0 || center.y < 0 || center.x >= state.board.width || center.y >= state.board.height)
    return { ok: false, error: '偵察地点が盤面外です。' };
  if (state.recon?.centers.some((p) => p.x === center.x && p.y === center.y)) return { ok: false, error: 'この地点は現在偵察中です。' };
  return {
    ok: true,
    value: {
      ...state,
      recon: {
        remaining: { red: remainingRecon(state, 'red'), blue: remainingRecon(state, 'blue'), [state.activePlayer]: remainingRecon(state, state.activePlayer) - 1 },
        centers: [...(state.recon?.centers ?? []), { x: center.x, y: center.y }],
      },
    },
  };
}

export function reconPositions(state: GameState, player: PlayerId): Position[] {
  if (!usesReconRules(state) || state.activePlayer !== player) return [];
  return (state.recon?.centers ?? []).flatMap((center) => {
    const positions: Position[] = [];
    for (let y = Math.max(0, center.y - RECON_RADIUS); y <= Math.min(state.board.height - 1, center.y + RECON_RADIUS); y++)
      for (let x = Math.max(0, center.x - RECON_RADIUS); x <= Math.min(state.board.width - 1, center.x + RECON_RADIUS); x++)
        if (Math.abs(center.x - x) + Math.abs(center.y - y) <= RECON_RADIUS) positions.push({ x, y });
    return positions;
  });
}

/** Check exact keys, bounded charges/centers and consistency with charges already spent. */
export function validRecon(state: GameState): boolean {
  const recon = state.recon;
  if (recon === undefined) return true;
  if (
    !usesReconRules(state) ||
    !recon ||
    typeof recon !== 'object' ||
    Array.isArray(recon) ||
    Object.keys(recon).sort().join() !== 'centers,remaining' ||
    !recon.remaining ||
    typeof recon.remaining !== 'object' ||
    Array.isArray(recon.remaining) ||
    Object.keys(recon.remaining).sort().join() !== 'blue,red' ||
    ![recon.remaining.red, recon.remaining.blue].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= RECON_USES) ||
    !Array.isArray(recon.centers) ||
    recon.centers.length > RECON_USES - (recon.remaining[state.activePlayer] ?? RECON_USES)
  )
    return false;
  const keys = new Set<string>();
  return recon.centers.every((center) => {
    if (
      !center ||
      typeof center !== 'object' ||
      Array.isArray(center) ||
      Object.keys(center).sort().join() !== 'x,y' ||
      !Number.isSafeInteger(center.x) ||
      !Number.isSafeInteger(center.y) ||
      center.x < 0 ||
      center.y < 0 ||
      center.x >= state.board.width ||
      center.y >= state.board.height
    )
      return false;
    const key = `${center.x},${center.y}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}
