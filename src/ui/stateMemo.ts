/** Keep only the current immutable state; stale matches cannot accumulate here. */
export class StateMemo<State extends object> {
  private state?: State;
  private values = new Map<string, unknown>();
  get<T>(state: State, key: string, compute: () => T): T {
    if (this.state !== state) {
      this.state = state;
      this.values.clear();
    }
    if (!this.values.has(key)) this.values.set(key, compute());
    return this.values.get(key) as T;
  }
}
