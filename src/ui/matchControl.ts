import { otherPlayer, type GameState, type PlayerId } from '../game';

/** 'cpu': the player (red) against the CPU (blue). 'hotseat': two people share one device. */
export type MatchMode = 'cpu' | 'hotseat';

export interface MatchContext {
  mode: MatchMode;
  activePlayer: PlayerId;
  winner?: PlayerId;
  replay: boolean;
  cpuInProgress: boolean;
  /** Hotseat only: the next player has not yet taken the device. */
  handoffPending: boolean;
}

/** The side whose view (fog, labels, resources) the screen shows. */
export function viewerFor(mode: MatchMode, activePlayer: PlayerId): PlayerId {
  return mode === 'hotseat' ? activePlayer : 'red';
}

/** The opposing side from the viewer's perspective. */
export const opponentOf = (viewer: PlayerId): PlayerId => otherPlayer(viewer);

/** Board commands (moves, attacks, production, end turn) for the side on the device. */
export function commandAllowed(context: MatchContext): boolean {
  return !context.replay && context.winner === undefined && !context.handoffPending && !context.cpuInProgress
    && context.activePlayer === viewerFor(context.mode, context.activePlayer);
}

/**
 * Menus and result-screen actions (restart, replays, saves, map choice). They do
 * not depend on whose turn it is, so they stay usable after a CPU wins on its own
 * turn, and are blocked only while a replay, CPU turn, or hotseat handoff runs.
 */
export function menuAllowed(context: MatchContext): boolean {
  return !context.replay && !context.cpuInProgress && !context.handoffPending;
}

/** The CPU plays blue only in CPU matches that are still running. */
export function cpuShouldRun(context: Pick<MatchContext, 'mode' | 'activePlayer' | 'winner' | 'replay'>): boolean {
  return context.mode === 'cpu' && context.activePlayer === 'blue' && context.winner === undefined && !context.replay;
}

/** After an end turn in a hotseat match, hand the device over unless the match just ended. */
export function handoffAfterEndTurn(mode: MatchMode, next: Pick<GameState, 'winner'>): boolean {
  return mode === 'hotseat' && next.winner === undefined;
}

/**
 * Undo stays a CPU-match convenience. Between two people it would let a player
 * move into fog, see what is there, and take the move back.
 */
export function undoAllowed(mode: MatchMode): boolean {
  return mode === 'cpu';
}

/** How the screen names a side: relative to the player in CPU matches, by colour in hotseat. */
export function sideName(mode: MatchMode, player: PlayerId): string {
  if (mode === 'hotseat') return player === 'red' ? '赤軍' : '青軍';
  return player === 'red' ? 'プレイヤー' : 'CPU';
}
