import { describe, expect, it } from 'vitest';
import { updateBoardZoomView } from './boardZoomView';
function fixture() {
  const root = document.createElement('div');
  root.innerHTML =
    '<div id="board-viewport"><div class="board"><button class="tile" aria-label="hidden">tile</button></div></div><div class="board-zoom-controls"><button id="board-zoom-out"></button><span></span><button id="board-zoom-in"></button></div>';
  return root;
}
describe('zoom without replacing the board', () => {
  it('updates geometry, bounds and live label while preserving tile identity, attributes and handlers', () => {
    const root = fixture(),
      tile = root.querySelector<HTMLButtonElement>('.tile')!,
      viewport = root.querySelector<HTMLElement>('#board-viewport')!;
    let clicks = 0;
    tile.onclick = () => clicks++;
    viewport.scrollLeft = 120;
    viewport.scrollTop = 250;
    for (const [index, pixels, percent] of [
      [0, 22, 50],
      [2, 44, 100],
      [5, 88, 200],
    ]) {
      expect(updateBoardZoomView(root, 32, 24, index!)).toBe(true);
      const board = root.querySelector<HTMLElement>('.board')!;
      expect(board.dataset.zoom).toBe(String(percent));
      expect(board.style.gridTemplateColumns.replace(/\s/g, '')).toBe(`repeat(32,${pixels}px)`);
      expect(viewport.style.maxHeight.replace(/\s/g, '')).toBe(`min(70vh,${24 * pixels! + 10}px)`);
      expect(root.querySelector('.board-zoom-controls span')?.textContent).toBe(`${percent}%`);
      expect(root.querySelector<HTMLButtonElement>('#board-zoom-out')!.disabled).toBe(index === 0);
      expect(root.querySelector<HTMLButtonElement>('#board-zoom-in')!.disabled).toBe(index === 5);
      expect(root.querySelector('.tile')).toBe(tile);
      expect(tile.getAttribute('aria-label')).toBe('hidden');
      tile.click();
    }
    expect(clicks).toBe(3);
    expect(viewport.scrollLeft).toBe(120);
    expect(viewport.scrollTop).toBe(250);
  });
  it('leaves incomplete or invalid views untouched so the caller can fully render', () => {
    const root = fixture(),
      before = root.innerHTML;
    for (const [width, height, index] of [
      [32, 32, -1],
      [32, 32, 6],
      [32, 32, 1.5],
      [0, 32, 2],
      [32, 0, 2],
      [1.5, 32, 2],
      [32, Number.NaN, 2],
    ])
      expect(updateBoardZoomView(root, width!, height!, index!)).toBe(false);
    expect(root.innerHTML).toBe(before);
    for (const selector of ['.board', '#board-viewport', '#board-zoom-out', '#board-zoom-in', '.board-zoom-controls span']) {
      const incomplete = fixture();
      incomplete.querySelector(selector)!.remove();
      const html = incomplete.innerHTML;
      expect(updateBoardZoomView(incomplete, 32, 32, 2)).toBe(false);
      expect(incomplete.innerHTML).toBe(html);
    }
  });
});
