import { describe, expect, it } from 'vitest';
import { commandAllowed, cpuShouldRun, handoffAfterEndTurn, menuAllowed, parseMatchMode, saveAllowed, sideName, spectateContinues, SPECTATE_TURN_LIMIT, undoAllowed, viewerFor, type MatchContext } from './matchControl';

const context = (patch: Partial<MatchContext> = {}): MatchContext => ({
  mode: 'cpu', activePlayer: 'red', replay: false, cpuInProgress: false, handoffPending: false, ...patch,
});

describe('match control (#116 10.5)', () => {
  it('shows the player’s side in CPU matches and the active side in hotseat', () => {
    expect(viewerFor('cpu', 'blue')).toBe('red');
    expect(viewerFor('hotseat', 'blue')).toBe('blue');
  });

  it('allows board commands only for the side on the device, outside handoffs and finished matches', () => {
    expect(commandAllowed(context())).toBe(true);
    expect(commandAllowed(context({ activePlayer: 'blue' }))).toBe(false);
    expect(commandAllowed(context({ mode: 'hotseat', activePlayer: 'blue' }))).toBe(true);
    expect(commandAllowed(context({ mode: 'hotseat', activePlayer: 'blue', handoffPending: true }))).toBe(false);
    expect(commandAllowed(context({ winner: 'red' }))).toBe(false);
    expect(commandAllowed(context({ replay: true }))).toBe(false);
    expect(commandAllowed(context({ cpuInProgress: true }))).toBe(false);
  });

  it('keeps menus usable after the CPU wins on its own turn (regression)', () => {
    // Previously every menu required activePlayer === 'red', so restart and
    // replays were dead after a CPU victory during blue's turn.
    expect(menuAllowed(context({ activePlayer: 'blue', winner: 'blue' }))).toBe(true);
    expect(menuAllowed(context({ mode: 'hotseat', activePlayer: 'blue', winner: 'blue' }))).toBe(true);
  });

  it('blocks menus during replays, CPU turns, and handoffs', () => {
    expect(menuAllowed(context({ replay: true }))).toBe(false);
    expect(menuAllowed(context({ cpuInProgress: true }))).toBe(false);
    expect(menuAllowed(context({ mode: 'hotseat', handoffPending: true }))).toBe(false);
  });

  it('runs the CPU only for blue in unfinished CPU matches', () => {
    expect(cpuShouldRun({ mode: 'cpu', activePlayer: 'blue', replay: false })).toBe(true);
    expect(cpuShouldRun({ mode: 'hotseat', activePlayer: 'blue', replay: false })).toBe(false);
    expect(cpuShouldRun({ mode: 'cpu', activePlayer: 'blue', winner: 'red', replay: false })).toBe(false);
    expect(cpuShouldRun({ mode: 'cpu', activePlayer: 'red', replay: false })).toBe(false);
  });

  it('hands over only in unfinished hotseat matches', () => {
    expect(handoffAfterEndTurn('hotseat', {})).toBe(true);
    expect(handoffAfterEndTurn('hotseat', { winner: 'blue' })).toBe(false);
    expect(handoffAfterEndTurn('cpu', {})).toBe(false);
  });

  it('disables undo between two people and names sides by colour', () => {
    expect(undoAllowed('cpu')).toBe(true);
    expect(undoAllowed('hotseat')).toBe(false);
    expect(sideName('cpu', 'blue')).toBe('CPU');
    expect(sideName('hotseat', 'blue')).toBe('青軍');
  });
});

describe('spectate mode (#129)', () => {
  it('follows the side whose turn it is', () => {
    expect(viewerFor('spectate', 'red')).toBe('red');
    expect(viewerFor('spectate', 'blue')).toBe('blue');
  });

  it('runs the CPU for both sides until the match ends or a replay is shown', () => {
    expect(cpuShouldRun({ mode: 'spectate', activePlayer: 'red', replay: false })).toBe(true);
    expect(cpuShouldRun({ mode: 'spectate', activePlayer: 'blue', replay: false })).toBe(true);
    expect(cpuShouldRun({ mode: 'spectate', activePlayer: 'red', winner: 'blue', replay: false })).toBe(false);
    expect(cpuShouldRun({ mode: 'spectate', activePlayer: 'red', replay: true })).toBe(false);
  });

  it('never accepts board commands, undo, or saves from the viewer', () => {
    expect(commandAllowed(context({ mode: 'spectate' }))).toBe(false);
    expect(commandAllowed(context({ mode: 'spectate', activePlayer: 'blue' }))).toBe(false);
    expect(undoAllowed('spectate')).toBe(false);
    expect(saveAllowed('spectate')).toBe(false);
    expect(saveAllowed('cpu')).toBe(true);
    expect(saveAllowed('hotseat')).toBe(true);
  });

  it('keeps menus usable while paused and blocks them while a CPU turn runs', () => {
    expect(menuAllowed(context({ mode: 'spectate', activePlayer: 'blue' }))).toBe(true);
    expect(menuAllowed(context({ mode: 'spectate', cpuInProgress: true }))).toBe(false);
  });

  it('never hands the device over and names sides by colour', () => {
    expect(handoffAfterEndTurn('spectate', {})).toBe(false);
    expect(sideName('spectate', 'red')).toBe('赤軍');
    expect(sideName('spectate', 'blue')).toBe('青軍');
  });

  it('stops chaining turns at the turn limit or when the match is decided', () => {
    expect(spectateContinues({ turn: 1 })).toBe(true);
    expect(spectateContinues({ turn: SPECTATE_TURN_LIMIT - 1 })).toBe(true);
    expect(spectateContinues({ turn: SPECTATE_TURN_LIMIT })).toBe(false);
    expect(spectateContinues({ turn: 3, winner: 'red' })).toBe(false);
    // Resuming moves the pause point another limit ahead.
    expect(spectateContinues({ turn: SPECTATE_TURN_LIMIT }, SPECTATE_TURN_LIMIT * 2)).toBe(true);
  });

  it('parses the briefing choice and falls back to a CPU match for unknown input', () => {
    expect(parseMatchMode('spectate')).toBe('spectate');
    expect(parseMatchMode('hotseat')).toBe('hotseat');
    expect(parseMatchMode('cpu')).toBe('cpu');
    expect(parseMatchMode('online')).toBe('cpu');
  });
});
