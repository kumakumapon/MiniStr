import type { Position } from '../game/types';

export function boardTileSelector(position: Position): string {
  return `.tile[data-x="${position.x}"][data-y="${position.y}"]`;
}

/** Roving tabindex is updated independently of pointer focus and tile rendering. */
export function syncBoardFocus(root: ParentNode, position: Position): HTMLButtonElement | null {
  const focused = root.querySelector<HTMLButtonElement>(boardTileSelector(position));
  root.querySelectorAll<HTMLButtonElement>('.tile[tabindex="0"]').forEach((tile) => {
    if (tile !== focused) tile.tabIndex = -1;
  });
  if (focused && focused.tabIndex !== 0) focused.tabIndex = 0;
  return focused;
}
