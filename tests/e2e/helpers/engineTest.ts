import { test as base } from '@playwright/test';
import { checkBrowserReadiness } from './browserReadiness';

/** Bootstrap WebKit in its worker fixture; each application test still gets a fresh context and its original 30s budget. */
export const test = base.extend({
  browser: [
    async ({ browser, browserName }, use, workerInfo) => {
      if (browserName === 'webkit') {
        const metrics = await checkBrowserReadiness(browser);
        console.info(JSON.stringify({ phase: 'webkit-engine-ready', target: 'about:blank', worker: workerInfo.workerIndex, version: browser.version(), ...metrics }));
      }
      await use(browser);
    },
    // Readiness has a separate bounded setup check, not an increased app-test timeout.
    { scope: 'worker', timeout: 30_000 },
  ],
});
