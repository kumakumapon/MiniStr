/** One last markup per cell, one immutable game state and one viewer/locale.
 * Selection variants overwrite entries rather than accumulating histories. */
export class TileMarkupCache<State extends object> {
  private state?: State;
  private identity = '';
  private context?: object;
  private cells: Array<{ flags: number; markup: string } | undefined> = [];
  clear(): void {
    this.state = undefined;
    this.context = undefined;
    this.cells = [];
  }
  get(state: State, identity: string, index: number, flags: number, compute: () => string, context?: object): string {
    if (this.state !== state || this.identity !== identity || this.context !== context) {
      this.state = state;
      this.identity = identity;
      this.context = context;
      this.cells = [];
    }
    const previous = this.cells[index];
    if (previous?.flags === flags) return previous.markup;
    const markup = compute();
    this.cells[index] = { flags, markup };
    return markup;
  }
}
