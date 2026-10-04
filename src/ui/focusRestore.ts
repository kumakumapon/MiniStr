export interface FocusRestoreTicket {
  renderRevision: number;
  focusRevision: number;
}

/** Prevents deferred focus restoration from overriding a newer user choice. */
export class FocusRestoreGuard {
  private focusRevision = 0;

  noteFocusChange(): void {
    this.focusRevision++;
  }

  capture(renderRevision: number): FocusRestoreTicket {
    return { renderRevision, focusRevision: this.focusRevision };
  }

  isCurrent(ticket: FocusRestoreTicket, renderRevision: number): boolean {
    return ticket.renderRevision === renderRevision && ticket.focusRevision === this.focusRevision;
  }
}
