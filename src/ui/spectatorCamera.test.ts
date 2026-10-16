import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBoard, createGameState, type GameCommand, type GameState, type Unit } from '../game';
import { setLocale } from './locale';
import { centerBoardOnPosition, renderSpectatorCamera, spectatorActionPosition, spectatorUnits } from './spectatorCamera';

const unit = (patch: Partial<Unit> = {}): Unit => ({
  id: 'u2',
  kind: 'tank',
  owner: 'red',
  position: { x: 0, y: 0 },
  hp: 100,
  hasMoved: false,
  hasActed: false,
  ...patch,
});
const state = (units: Unit[] = []): GameState => ({ ...createGameState(createBoard(8, 4)), units });

afterEach(() => {
  setLocale('ja');
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('spectator unit selection', () => {
  it('offers only currently visible deployed units in stable numeric order without changing the state', () => {
    const game = state([
      unit({ id: 'u10', position: { x: 2, y: 0 } }),
      unit(),
      unit({ id: 'blue', owner: 'blue', position: { x: 1, y: 0 } }),
      unit({ id: 'hidden', owner: 'blue', position: { x: 7, y: 3 } }),
      unit({ id: 'cargo', kind: 'infantry', position: undefined, embarkedIn: 'u2' }),
    ]);
    const before = structuredClone(game);
    expect(spectatorUnits(game, new Set(['0,0', '1,0', '2,0'])).map((unit) => unit.id)).toEqual(['blue', 'u2', 'u10']);
    expect(game).toEqual(before);
  });

  it('renders follow and manual-location controls, escaping unit IDs and selecting the located unit', () => {
    const id = '<img src=x>';
    document.body.innerHTML = renderSpectatorCamera(state([unit({ id })]), new Set(['0,0']), true, id);
    expect(document.querySelector('#spectate-follow')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector<HTMLSelectElement>('#spectate-locate-unit')?.value).toBe(id);
    expect(document.querySelector('img')).toBeNull();
    expect(document.body.textContent).toContain('赤軍');
  });

  it('renders English labels and disables location selection when no unit is visible', () => {
    setLocale('en');
    document.body.innerHTML = renderSpectatorCamera(state([unit()]), new Set(), false);
    expect(document.querySelector('#spectate-follow')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.body.textContent).toContain('Follow acting units');
    expect(document.querySelector<HTMLSelectElement>('#spectate-locate-unit')?.disabled).toBe(true);
    expect(document.querySelectorAll('option')).toHaveLength(1);
  });
});

describe('spectator action location', () => {
  it('follows the actual position after a move interrupted before its requested destination', () => {
    const before = state([unit()]);
    const after = state([unit({ position: { x: 2, y: 0 } })]);
    expect(spectatorActionPosition(before, after, { type: 'move', unitId: 'u2', destination: { x: 5, y: 0 } })).toEqual({ x: 2, y: 0 });
  });

  it.each(['wait', 'capture'] as const)('follows the acting unit for %s', (type) => {
    const game = state([unit()]);
    expect(spectatorActionPosition(game, game, { type, unitId: 'u2' })).toEqual({ x: 0, y: 0 });
  });

  it('retains the last known location of an attacker destroyed by the counterattack', () => {
    expect(spectatorActionPosition(state([unit()]), state(), { type: 'attack', unitId: 'u2', targetId: 'enemy' })).toEqual({ x: 0, y: 0 });
    expect(spectatorActionPosition(state(), state(), { type: 'attack', unitId: 'missing', targetId: 'enemy' })).toBeUndefined();
  });

  it('follows the surviving merge target instead of the removed actor', () => {
    const target = unit({ id: 'target', position: { x: 1, y: 0 } });
    expect(spectatorActionPosition(state([unit(), target]), state([target]), { type: 'merge', unitId: 'u2', targetId: 'target' })).toEqual({ x: 1, y: 0 });
  });

  it('follows the transport after boarding and the deployed destination after unloading', () => {
    const transport = unit({ id: 'apc', kind: 'apc', position: { x: 1, y: 0 } });
    const before = state([unit({ kind: 'infantry' }), transport]);
    const after = state([unit({ kind: 'infantry', position: undefined, embarkedIn: 'apc' }), transport]);
    expect(spectatorActionPosition(before, after, { type: 'embark', unitId: 'u2', transportId: 'apc' })).toEqual({ x: 1, y: 0 });
    const command: GameCommand = { type: 'disembark', transportId: 'apc', destination: { x: 2, y: 0 } };
    const position = spectatorActionPosition(after, before, command);
    expect(position).toEqual(command.destination);
    expect(position).not.toBe(command.destination);
  });

  it('locates production and the newly active side, handling a side with no deployed units', () => {
    const before = state([unit()]);
    const after: GameState = { ...before, activePlayer: 'blue', units: [unit({ owner: 'blue', position: { x: 7, y: 3 } })] };
    expect(spectatorActionPosition(before, after, { type: 'produce', factory: { x: 3, y: 1 }, kind: 'tank' })).toEqual({ x: 3, y: 1 });
    expect(spectatorActionPosition(before, after, { type: 'endTurn' })).toEqual({ x: 7, y: 3 });
    expect(spectatorActionPosition(before, { ...after, units: [unit()] }, { type: 'endTurn' })).toBeUndefined();
  });
});

function viewport() {
  document.body.innerHTML = '<button id="manual">Control</button><div id="board-viewport"><button class="tile" data-x="2" data-y="1"></button></div>';
  const board = document.querySelector<HTMLElement>('#board-viewport')!;
  const tile = board.querySelector<HTMLElement>('.tile')!;
  Object.defineProperties(board, {
    clientWidth: { value: 300 },
    clientHeight: { value: 200 },
    scrollWidth: { value: 900 },
    scrollHeight: { value: 800 },
    clientLeft: { value: 2 },
    clientTop: { value: 2 },
  });
  board.scrollLeft = 100;
  board.scrollTop = 50;
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 300, 200));
  const rect = vi.spyOn(tile, 'getBoundingClientRect').mockReturnValue(new DOMRect(412, 272, 40, 40));
  return { board, rect };
}

describe('spectator map scrolling', () => {
  it('centers inside the bordered map without scrolling the page or moving focus', () => {
    const { board } = viewport();
    const control = document.querySelector<HTMLButtonElement>('#manual')!;
    control.focus();
    const pageScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    centerBoardOnPosition(document, { x: 2, y: 1 });
    expect(board.scrollLeft).toBe(370);
    expect(board.scrollTop).toBe(220);
    expect(document.activeElement).toBe(control);
    expect(pageScroll).not.toHaveBeenCalled();
  });

  it('clamps scrolling at both ends of the map', () => {
    const { board, rect } = viewport();
    rect.mockReturnValue(new DOMRect(-1000, -1000, 40, 40));
    centerBoardOnPosition(document, { x: 2, y: 1 });
    expect([board.scrollLeft, board.scrollTop]).toEqual([0, 0]);
    rect.mockReturnValue(new DOMRect(2000, 2000, 40, 40));
    centerBoardOnPosition(document, { x: 2, y: 1 });
    expect([board.scrollLeft, board.scrollTop]).toEqual([600, 600]);
  });

  it('ignores invalid positions and missing map elements', () => {
    const { board } = viewport();
    for (const position of [
      { x: -1, y: 1 },
      { x: 0.5, y: 1 },
      { x: 2, y: Infinity },
      { x: 7, y: 3 },
    ]) {
      centerBoardOnPosition(document, position);
      expect([board.scrollLeft, board.scrollTop]).toEqual([100, 50]);
    }
    document.body.innerHTML = '';
    expect(() => centerBoardOnPosition(document, { x: 2, y: 1 })).not.toThrow();
  });
});
