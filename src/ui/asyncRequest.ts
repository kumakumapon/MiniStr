/** Makes the most recently started asynchronous read the only one allowed to commit. */
export class AsyncRequestGate {
  private generation = 0;

  begin(): number {
    this.generation++;
    return this.generation;
  }

  isCurrent(request: number): boolean {
    return request === this.generation;
  }

  invalidate(): void {
    this.generation++;
  }
}
