import { syncAttributes } from './domAttributes';

/** Retain tiles while the surrounding screen is redrawn. Only the current board is held. */
export class BoardView {
  private board?: HTMLElement;
  private cells: readonly string[] = [];
  private identity = '';
  private context?: object;

  /** Park one localized clone off-DOM; native listeners are rebound on resume. */
  cover(replacement: HTMLElement | null, identity: string, context: object): boolean {
    if (!replacement || !this.board || this.identity !== identity || this.context !== context) {
      this.update(replacement, [], identity);
      replacement?.replaceChildren();
      return false;
    }
    this.board.querySelectorAll('.presentation-effect').forEach((effect) => effect.remove());
    if (replacement === this.board) {
      this.board = replacement.cloneNode(true) as HTMLElement;
      replacement.replaceWith(replacement.cloneNode(false));
    } else replacement.replaceChildren();
    return true;
  }

  update(replacement: HTMLElement | null, cells: readonly string[], identity: string, localize: (root: HTMLElement) => void = () => {}, context?: object): void {
    if (!replacement || !cells.length) {
      this.board = undefined;
      this.cells = [];
      this.context = undefined;
      return;
    }
    const retained = this.board && this.identity === identity && this.cells.length === cells.length;
    const board = retained ? this.board! : replacement;
    if (board !== replacement) {
      syncAttributes(board, replacement);
      replacement.replaceWith(board);
    }
    // Transient feedback belongs to the previous render, not the retained tile model.
    board.querySelectorAll('.presentation-effect').forEach((effect) => effect.remove());
    if (!retained) {
      board.innerHTML = cells.join('');
      localize(board);
      this.board = board;
      this.cells = cells;
      this.identity = identity;
      this.context = context;
      return;
    }
    const tiles = [...board.children] as HTMLElement[];
    const template = document.createElement('template');
    cells.forEach((markup, index) => {
      if (this.cells[index] !== markup) {
        // Markup is produced by the same escaped tile template used for the full screen.
        template.innerHTML = markup;
        const tile = template.content.firstElementChild! as HTMLElement;
        localize(tile);
        const previous = tiles[index];
        if (previous && previous.tagName === tile.tagName) {
          // Removing a focused button forces layout and drops native focus.
          // Keep the button and apply the full current model (including fog).
          syncAttributes(previous, tile);
          if (previous.innerHTML !== tile.innerHTML) previous.replaceChildren(...tile.childNodes);
        } else {
          tiles[index] = tile;
          if (previous) previous.replaceWith(tile);
          else board.append(tile);
        }
      }
      // Replay binds no game commands; handlers are refreshed by the current render only.
      const tile = tiles[index]!;
      tile.onclick = null;
      tile.onkeydown = null;
      tile.onfocus = null;
    });
    this.board = board;
    this.cells = cells;
    this.identity = identity;
    this.context = context;
  }
}
