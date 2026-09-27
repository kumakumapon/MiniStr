import type { GameState, PlayerId, SavedMatchMode } from '../game';

/**
 * 'cpu': the player (red) against the CPU (blue). 'hotseat': two people share one device.
 * 'spectate': the CPU plays both sides while the person on the device watches.
 */
export type MatchMode = 'cpu' | 'hotseat' | 'spectate';

export const MATCH_MODES: readonly MatchMode[] = ['cpu', 'hotseat', 'spectate'];

/** Spectating pauses itself every this many turns so a match neither side can finish does not run forever. */
export const SPECTATE_TURN_LIMIT = 100;

/** Reads a mode from untrusted form input; anything unknown is a CPU match. */
export function parseMatchMode(value: string): MatchMode {
  return MATCH_MODES.find(mode => mode === value) ?? 'cpu';
}

export interface MatchContext {
  mode: MatchMode;
  activePlayer: PlayerId;
  winner?: PlayerId;
  replay: boolean;
  cpuInProgress: boolean;
  /** Hotseat only: the next player has not yet taken the device. */
  handoffPending: boolean;
}

/**
 * The side whose view (fog, labels, resources) the screen shows. A spectator
 * follows the side whose turn it is, seeing what that CPU sees.
 */
export function viewerFor(mode: MatchMode, activePlayer: PlayerId): PlayerId {
  return mode === 'cpu' ? 'red' : activePlayer;
}

/** Board commands (moves, attacks, production, end turn) for the side on the device. */
export function commandAllowed(context: MatchContext): boolean {
  return context.mode !== 'spectate'
    && !context.replay && context.winner === undefined && !context.handoffPending && !context.cpuInProgress
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

/** The CPU plays blue in CPU matches and both sides when spectating, while the match is still running. */
export function cpuShouldRun(context: Pick<MatchContext, 'mode' | 'activePlayer' | 'winner' | 'replay'>): boolean {
  const cpuSide = context.mode === 'spectate' || (context.mode === 'cpu' && context.activePlayer === 'blue');
  return cpuSide && context.winner === undefined && !context.replay;
}

/**
 * Whether a spectated match should keep chaining CPU turns without the viewer
 * pressing resume. Resuming moves `pauseAtTurn` another limit ahead.
 */
export function spectateContinues(state: Pick<GameState, 'turn' | 'winner'>, pauseAtTurn: number = SPECTATE_TURN_LIMIT): boolean {
  return state.winner === undefined && state.turn < pauseAtTurn;
}

/** Autosaves and manual saves are for matches a person plays; spectating never overwrites them. */
export function saveAllowed(mode: MatchMode): mode is SavedMatchMode {
  return mode !== 'spectate';
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

/** How the screen names a side: relative to the player in CPU matches, by colour otherwise. */
export function sideName(mode: MatchMode, player: PlayerId): string {
  if (mode !== 'cpu') return player === 'red' ? '赤軍' : '青軍';
  return player === 'red' ? 'プレイヤー' : 'CPU';
}
