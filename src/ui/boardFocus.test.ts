import { expect, it } from 'vitest';
import { boardTileSelector, syncBoardFocus } from './boardFocus';

it('keeps a single roving tab stop without moving focus or activating a tile', () => {
  document.body.innerHTML = '<div><button class="tile" data-x="0" data-y="1" tabindex="0">a</button><button class="tile" data-x="2" data-y="1" tabindex="-1">b</button></div>';
  const host = document.body.firstElementChild!;
  const old = host.querySelector<HTMLButtonElement>('button')!;
  old.focus();
  const next = syncBoardFocus(host, { x: 2, y: 1 });
  expect(old.tabIndex).toBe(-1);
  expect(next!.tabIndex).toBe(0);
  expect(document.activeElement).toBe(old);
  expect(host.querySelectorAll('.tile[tabindex="0"]')).toHaveLength(1);
  expect(boardTileSelector({ x: 2, y: 1 })).toBe('.tile[data-x="2"][data-y="1"]');
  expect(syncBoardFocus(host, { x: 99, y: 99 })).toBeNull();
  expect(next!.tabIndex).toBe(-1);
});
