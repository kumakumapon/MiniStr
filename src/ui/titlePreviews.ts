import { escapeHtml } from './strings';

type Observer = Pick<IntersectionObserver, 'observe' | 'unobserve' | 'disconnect'>;
type Observe = (callback: IntersectionObserverCallback) => Observer | undefined;

/** Only the current title's pending artwork is held; completed and stale work is released. */
export class TitlePreviews {
  private drawings = new Map<string, () => string>();
  private pending = new Map<Element, () => string>();
  private observer?: Observer;

  constructor(
    private readonly observe: Observe = (callback) => (typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(callback, { rootMargin: '80px' })),
  ) {}

  reset(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.drawings.clear();
    this.pending.clear();
  }

  placeholder(id: string, draw: () => string): string {
    this.drawings.set(id, draw);
    return `<span class="title-preview-slot" data-title-preview="${escapeHtml(id)}" aria-hidden="true"></span>`;
  }

  connect(root: HTMLElement): void {
    if (!this.drawings.size) return;
    this.observer = this.observe((entries) => {
      for (const entry of entries) if (entry.isIntersecting) this.draw(entry.target);
    });
    for (const element of root.querySelectorAll<HTMLElement>('[data-title-preview]')) {
      const draw = this.drawings.get(element.dataset.titlePreview!);
      if (!draw) continue;
      this.pending.set(element, draw);
      if (this.observer) this.observer.observe(element);
      else this.draw(element);
    }
    this.drawings.clear();
  }

  private draw(element: Element): void {
    const draw = this.pending.get(element);
    if (!draw) return;
    this.pending.delete(element);
    this.observer?.unobserve(element);
    if (element.isConnected) element.innerHTML = draw();
  }
}
