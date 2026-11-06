export interface FocusRestoreTicket {
  renderRevision: number;
  focusRevision: number;
}

/** Even focus with preventScroll can force layout; retained focus needs no write. */
export function focusIfChanged(target: HTMLElement | null | undefined, options: FocusOptions): void {
  if (target && target.ownerDocument.activeElement !== target) target.focus(options);
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
