import { describe, expect, it, vi } from 'vitest';
import { captureRenderScroll } from './renderScroll';

describe('render scroll restoration', () => {
  it('preserves the page, board and menu scroll when redraw replaces the DOM', () => {
    document.body.innerHTML = '<div id="board-viewport"></div><div id="production-menu-body"></div>';
    const board = document.querySelector<HTMLElement>('#board-viewport')!;
    board.scrollLeft = 180;
    board.scrollTop = 70;
    document.querySelector<HTMLElement>('#production-menu-body')!.scrollTop = 95;
    const viewport = { scrollX: 0, scrollY: 400, scrollTo: vi.fn() };
    const restore = captureRenderScroll(document, viewport as unknown as Window);
    document.body.innerHTML = '<div id="board-viewport"></div><div id="production-menu-body"></div>';
    viewport.scrollY = 0;
    restore();
    expect(document.querySelector<HTMLElement>('#board-viewport')?.scrollLeft).toBe(180);
    expect(document.querySelector<HTMLElement>('#board-viewport')?.scrollTop).toBe(70);
    expect(document.querySelector<HTMLElement>('#production-menu-body')?.scrollTop).toBe(95);
    expect(viewport.scrollTo).toHaveBeenCalledWith({ left: 0, top: 400, behavior: 'instant' });
  });

  it('handles missing containers and avoids scrolling an unchanged page', () => {
    document.body.innerHTML = '<div id="board-viewport"></div>';
    const viewport = { scrollX: 0, scrollY: 0, scrollTo: vi.fn() };
    const restore = captureRenderScroll(document, viewport as unknown as Window);
    document.body.innerHTML = '';
    expect(restore).not.toThrow();
    expect(viewport.scrollTo).not.toHaveBeenCalled();
  });
});
