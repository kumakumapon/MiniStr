/** Keeps keyboard focus within the currently modal dialog. */
export function installModalFocusTrap(document: Document): void {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const dialog = document.querySelector<HTMLElement>(
      '[role="dialog"][aria-modal="true"]',
    );
    if (!dialog) return;
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter(
      (element) =>
        !element.hidden &&
        document.defaultView?.getComputedStyle(element).display !== "none" &&
        document.defaultView?.getComputedStyle(element).visibility !== "hidden",
    );
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        !dialog.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        !dialog.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  });
}
