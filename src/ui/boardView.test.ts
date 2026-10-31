import { expect, it } from 'vitest';
import { BoardView } from './boardView';
const tile = (text: string, extra = '') => `<button class="tile ${extra}" aria-label="${text}">${text}</button>`;
const root = () => {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  return root;
};
const draw = (view: BoardView, root: HTMLElement, cells: string[], identity = 'ja:2:1') => {
  root.innerHTML = '<div class="board" role="group"></div>';
  view.update(root.querySelector('.board'), cells, identity);
  return root.querySelector<HTMLElement>('.board')!;
};
it('keeps unchanged board and tiles, replaces changed cells, refreshes attributes and handlers', () => {
  const view = new BoardView(),
    host = root();
  const a = draw(view, host, [tile('plain'), tile('enemy')]);
  const first = a.children[0] as HTMLElement,
    second = a.children[1];
  first.onclick = () => {
    throw Error('stale game handler');
  };
  first.onkeydown = () => {};
  first.onfocus = () => {};
  a.setAttribute('data-old', 'yes');
  const b = draw(view, host, [tile('plain'), tile('fog', 'fog')]);
  expect(b).toBe(a);
  expect(b.children[0]).toBe(first);
  expect(b.children[1]).not.toBe(second);
  expect(b.textContent).not.toContain('enemy');
  expect(b.hasAttribute('data-old')).toBe(false);
  expect(first.onclick).toBeNull();
  expect(first.onkeydown).toBeNull();
  expect(first.onfocus).toBeNull();
});
it('invalidates locale, geometry and replay identities and differing cell counts', () => {
  const view = new BoardView(),
    host = root();
  let previous = draw(view, host, [tile('plain')]);
  for (const id of ['en:1:1', 'en:1:1:replay', 'en:2:1']) {
    const next = draw(view, host, [tile('road')], id);
    expect(next).not.toBe(previous);
    previous = next;
  }
  expect(draw(view, host, [tile('road'), tile('forest')], 'en:2:1')).not.toBe(previous);
});
it('drops covered or removed boards and reopens with fresh content', () => {
  const view = new BoardView(),
    host = root();
  const old = draw(view, host, [tile('enemy')]);
  draw(view, host, []);
  expect(host.textContent).toBe('');
  expect(draw(view, host, [tile('fog')])).not.toBe(old);
  view.update(null, [], '');
  expect(draw(view, host, [tile('plain')]).textContent).toBe('plain');
});
it('keeps already localized unchanged cells and refreshes board attributes', () => {
  const view = new BoardView(),
    host = root();
  const cells = [tile('平原')];
  const board = draw(view, host, cells, 'en');
  board.children[0]!.textContent = 'Plain';
  host.innerHTML = '<div class="board recon-targeting" data-zoom="50"></div>';
  view.update(host.querySelector('.board'), cells, 'en');
  expect(host.textContent).toBe('Plain');
  expect(board.dataset.zoom).toBe('50');
  expect(board.classList.contains('recon-targeting')).toBe(true);
});
