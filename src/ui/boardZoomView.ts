import { boardTileSize, boardZoomPercent, BOARD_ZOOM_LEVELS } from './boardZoom';

/** Zoom changes geometry only; keep tiles, their listeners, and scroll containers alive. */
export function updateBoardZoomView(root: ParentNode, width: number, height: number, index: number): boolean {
  const board = root.querySelector<HTMLElement>('.board');
  const viewport = root.querySelector<HTMLElement>('#board-viewport');
  const out = root.querySelector<HTMLButtonElement>('#board-zoom-out');
  const into = root.querySelector<HTMLButtonElement>('#board-zoom-in');
  const label = root.querySelector<HTMLElement>('.board-zoom-controls span');
  if (
    !board ||
    !viewport ||
    !out ||
    !into ||
    !label ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= BOARD_ZOOM_LEVELS.length ||
    !Number.isInteger(width) ||
    width < 1 ||
    !Number.isInteger(height) ||
    height < 1
  )
    return false;
  const size = boardTileSize(index);
  board.dataset.zoom = String(boardZoomPercent(index));
  board.style.gridTemplateColumns = `repeat(${width},${size}px)`;
  board.style.gridTemplateRows = `repeat(${height},${size}px)`;
  viewport.style.maxHeight = `min(70vh, ${height * size + 10}px)`;
  out.disabled = index === 0;
  into.disabled = index === BOARD_ZOOM_LEVELS.length - 1;
  label.textContent = `${boardZoomPercent(index)}%`;
  return true;
}
