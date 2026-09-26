import { describe, expect, it } from 'vitest';
import { commandAllowed, cpuShouldRun, handoffAfterEndTurn, menuAllowed, sideName, undoAllowed, viewerFor, type MatchContext } from './matchControl';

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
