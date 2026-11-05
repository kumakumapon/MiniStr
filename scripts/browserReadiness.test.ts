import { expect, it, vi } from 'vitest';
import { checkBrowserReadiness } from '../tests/e2e/helpers/browserReadiness';

function fixture() {
  const calls: string[] = [];
  const page = {
    url: () => 'about:blank',
    title: vi.fn(async () => {
      calls.push('title');
      return '';
    }),
  };
  const context = {
    newPage: vi.fn(async () => {
      calls.push('page');
      return page;
    }),
    close: vi.fn(async () => {
      calls.push('close');
    }),
  };
  const browser = {
    newContext: vi.fn(async () => {
      calls.push('context');
      return context;
    }),
  };
  return { browser, context, page, calls };
}

it('checks a blank engine round trip and closes its context before returning timings', async () => {
  const { browser, context, calls } = fixture();
  const times = [0, 3, 13, 15, 16];
  const result = await checkBrowserReadiness(browser, () => times.shift()!);
  expect(result).toEqual({ contextMs: 3, pageMs: 10, roundTripMs: 2, totalMs: 16 });
  expect(calls).toEqual(['context', 'page', 'title', 'close']);
  expect(context.close).toHaveBeenCalledOnce();
  expect(browser.newContext).toHaveBeenCalledExactlyOnceWith();
});

it('propagates a renderer initialization failure and closes the probe context', async () => {
  const { browser, context, page } = fixture();
  const failure = new Error('renderer unavailable');
  page.title.mockRejectedValue(failure);
  await expect(checkBrowserReadiness(browser)).rejects.toBe(failure);
  expect(context.close).toHaveBeenCalledOnce();
});

it('closes the context if page creation fails and does not enter application pages', async () => {
  const { browser, context } = fixture();
  context.newPage.mockRejectedValueOnce(new Error('page unavailable'));
  await expect(checkBrowserReadiness(browser)).rejects.toThrow('page unavailable');
  expect(context.close).toHaveBeenCalledOnce();
  const other = fixture();
  other.page.url = () => 'http://localhost/';
  await expect(checkBrowserReadiness(other.browser)).rejects.toThrow('blank document');
  expect(other.page.title).not.toHaveBeenCalled();
  expect(other.context.close).toHaveBeenCalledOnce();
});

it('fails on context creation or cleanup errors rather than reporting readiness', async () => {
  const { browser } = fixture();
  browser.newContext.mockRejectedValueOnce(new Error('context unavailable'));
  await expect(checkBrowserReadiness(browser)).rejects.toThrow('context unavailable');
  const other = fixture();
  other.context.close.mockRejectedValueOnce(new Error('cleanup unavailable'));
  await expect(checkBrowserReadiness(other.browser)).rejects.toThrow('cleanup unavailable');
});
