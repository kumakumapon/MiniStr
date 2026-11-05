import { afterEach, expect, it, vi } from 'vitest';
import { TitlePreviews } from './titlePreviews';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('draws only intersecting cards, once, and leaves other cards pending', () => {
  let notify!: IntersectionObserverCallback;
  const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  const previews = new TitlePreviews((callback) => {
    notify = callback;
    return observer;
  });
  const a = vi.fn(() => '<svg data-map="a"></svg>'),
    b = vi.fn(() => '<svg data-map="b"></svg>');
  document.body.innerHTML = previews.placeholder('a', a) + previews.placeholder('b', b);
  previews.connect(document.body);
  const [first, second] = [...document.querySelectorAll('[data-title-preview]')];
  notify(
    [
      { target: first, isIntersecting: true },
      { target: second, isIntersecting: false },
    ] as IntersectionObserverEntry[],
    observer as unknown as IntersectionObserver,
  );
  expect(a).toHaveBeenCalledTimes(1);
  expect(b).not.toHaveBeenCalled();
  expect(first?.querySelector('svg')?.getAttribute('data-map')).toBe('a');
  notify(
    [
      { target: first, isIntersecting: true },
      { target: second, isIntersecting: true },
    ] as IntersectionObserverEntry[],
    observer as unknown as IntersectionObserver,
  );
  expect(a).toHaveBeenCalledTimes(1);
  expect(b).toHaveBeenCalledTimes(1);
  expect(observer.unobserve).toHaveBeenCalledTimes(2);
});

it('disconnects and refuses callbacks from a previous title, including reused IDs', () => {
  const callbacks: IntersectionObserverCallback[] = [];
  const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  const previews = new TitlePreviews((callback) => {
    callbacks.push(callback);
    return observer;
  });
  const old = vi.fn(() => '<svg></svg>'),
    current = vi.fn(() => '<svg></svg>');
  document.body.innerHTML = previews.placeholder('a', old);
  previews.connect(document.body);
  const previous = document.body.firstElementChild!;
  previews.reset();
  document.body.innerHTML = previews.placeholder('a', current);
  previews.connect(document.body);
  callbacks[0]!([{ target: previous, isIntersecting: true }] as IntersectionObserverEntry[], observer as unknown as IntersectionObserver);
  expect(old).not.toHaveBeenCalled();
  expect(current).not.toHaveBeenCalled();
  expect(observer.disconnect).toHaveBeenCalledTimes(1);
});

it('does not draw detached or unknown slots, and skips observation when there is no title', () => {
  let notify!: IntersectionObserverCallback;
  const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  const factory = vi.fn((callback: IntersectionObserverCallback) => {
    notify = callback;
    return observer;
  });
  const previews = new TitlePreviews(factory),
    draw = vi.fn(() => '<svg></svg>');
  previews.connect(document.body);
  expect(factory).not.toHaveBeenCalled();
  document.body.innerHTML = previews.placeholder('a', draw) + '<span data-title-preview="unknown"></span>';
  previews.connect(document.body);
  const element = document.body.firstElementChild!;
  element.remove();
  notify([{ target: element, isIntersecting: true }] as IntersectionObserverEntry[], observer as unknown as IntersectionObserver);
  expect(draw).not.toHaveBeenCalled();
  expect(observer.observe).toHaveBeenCalledTimes(1);
});

it('uses immediate rendering without IntersectionObserver and escapes authored IDs', () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  const previews = new TitlePreviews();
  document.body.innerHTML = previews.placeholder('a"<', () => '<svg></svg>');
  previews.connect(document.body);
  expect(document.body.children).toHaveLength(1);
  expect(document.querySelector('[data-title-preview]')?.getAttribute('data-title-preview')).toBe('a"<');
  expect(document.querySelector('svg')).not.toBeNull();
  previews.reset();
});

it('uses the native observer with a small preload margin', () => {
  const factory = vi.fn(function () {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  });
  vi.stubGlobal('IntersectionObserver', factory);
  const previews = new TitlePreviews();
  document.body.innerHTML = previews.placeholder('a', () => '<svg></svg>');
  previews.connect(document.body);
  expect(factory).toHaveBeenCalledWith(expect.any(Function), { rootMargin: '80px' });
  previews.reset();
});
