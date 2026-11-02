import type { Position } from '../game/types';

export interface BoardHandlers {
  click(position: Position): void;
  key(event: KeyboardEvent, position: Position): void;
  focus(position: Position): void;
}

/** One listener per event, even when a large board retains its tiles across renders. */
export class BoardInput {
  private board?: HTMLElement;
  private handlers?: BoardHandlers;
  private position(event: Event): Position | undefined {
    const tile = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button.tile') : null;
    if (!tile || tile.parentElement !== this.board || tile.disabled) return;
    const x = Number(tile.dataset.x),
      y = Number(tile.dataset.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return;
    return { x, y };
  }
  private click = (event: Event) => {
    const p = this.position(event);
    if (p) this.handlers?.click(p);
  };
  private key = (event: KeyboardEvent) => {
    const p = this.position(event);
    if (p) this.handlers?.key(event, p);
  };
  private focus = (event: Event) => {
    const p = this.position(event);
    if (p) this.handlers?.focus(p);
  };
  update(board: HTMLElement | null, handlers?: BoardHandlers): void {
    if (this.board !== board || !handlers) {
      this.board?.removeEventListener('click', this.click);
      this.board?.removeEventListener('keydown', this.key);
      this.board?.removeEventListener('focusin', this.focus);
      this.board = undefined;
    }
    this.handlers = handlers;
    if (!board || !handlers || this.board === board) return;
    this.board = board;
    board.addEventListener('click', this.click);
    board.addEventListener('keydown', this.key);
    board.addEventListener('focusin', this.focus);
  }
}
