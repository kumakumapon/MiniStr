/** Retain unchanged tiles while the surrounding screen is redrawn. Only the current board is held. */
export class BoardView {
  private board?: HTMLElement;
  private cells: readonly string[] = [];
  private identity = '';

  update(replacement: HTMLElement | null, cells: readonly string[], identity: string, localize: (root: HTMLElement) => void = () => {}): void {
    if (!replacement || !cells.length) {
      this.board = undefined;
      this.cells = [];
      return;
    }
    const board = this.board && this.identity === identity && this.cells.length === cells.length ? this.board : replacement;
    if (board !== replacement) {
      for (const attribute of [...board.attributes]) if (!replacement.hasAttribute(attribute.name)) board.removeAttribute(attribute.name);
      for (const attribute of replacement.attributes) if (board.getAttribute(attribute.name) !== attribute.value) board.setAttribute(attribute.name, attribute.value);
      replacement.replaceWith(board);
    }
    if (board === replacement) board.innerHTML = cells.join('');
    const tiles = [...board.children] as HTMLElement[];
    if (board === replacement) localize(board);
    const template = document.createElement('template');
    cells.forEach((markup, index) => {
      if (board !== replacement && this.cells[index] !== markup) {
        // Markup is produced by the same escaped tile template used for the full screen.
        template.innerHTML = markup;
        const tile = template.content.firstElementChild! as HTMLElement;
        localize(tile);
        const previous = tiles[index];
        tiles[index] = tile;
        if (previous) previous.replaceWith(tile);
        else board.append(tile);
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
  }
}
