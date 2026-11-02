import { expect, it, vi } from 'vitest';
import { BoardInput } from './boardInput';

function setup() {
  document.body.innerHTML = '<div class="board"><button class="tile" data-x="1" data-y="2"><span>unit</span></button></div>';
  const board = document.querySelector<HTMLElement>('.board')!;
  const handlers = { click: vi.fn(), key: vi.fn(), focus: vi.fn() };
  const input = new BoardInput();
  input.update(board, handlers);
  return { input, board, handlers, tile: board.firstElementChild as HTMLButtonElement };
}
it('delegates descendant clicks, keyboard events and focus with numeric coordinates', () => {
  const { tile, handlers } = setup();
  tile.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  tile.focus();
  expect(handlers.click).toHaveBeenCalledExactlyOnceWith({ x: 1, y: 2 });
  expect(handlers.key).toHaveBeenCalledWith(expect.objectContaining({ key: 'ArrowDown' }), { x: 1, y: 2 });
  expect(handlers.focus).toHaveBeenCalledExactlyOnceWith({ x: 1, y: 2 });
});
it('refreshes handlers without accumulating listeners on a retained board', () => {
  const { input, board, tile, handlers } = setup();
  const next = { ...handlers, click: vi.fn() };
  for (let i = 0; i < 10; i++) input.update(board, next);
  tile.click();
  expect(next.click).toHaveBeenCalledTimes(1);
  expect(handlers.click).not.toHaveBeenCalled();
});
it('unbinds replay, covered and replaced boards', () => {
  const { input, board, tile, handlers } = setup();
  input.update(board);
  tile.click();
  expect(handlers.click).not.toHaveBeenCalled();
  input.update(board, handlers);
  input.update(null, handlers);
  tile.click();
  const next = document.createElement('div');
  input.update(next, handlers);
  tile.click();
  expect(handlers.click).not.toHaveBeenCalled();
});
it('ignores disabled, nested or malformed cells and unrelated board clicks', () => {
  const { board, tile, handlers } = setup();
  tile.disabled = true;
  tile.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  tile.disabled = false;
  for (const x of ['NaN', '-1', '1.5']) {
    tile.dataset.x = x;
    tile.click();
  }
  board.click();
  board.innerHTML = '<div><button class="tile" data-x="1" data-y="2">nested</button></div>';
  board.querySelector('button')!.click();
  expect(handlers.click).not.toHaveBeenCalled();
});
