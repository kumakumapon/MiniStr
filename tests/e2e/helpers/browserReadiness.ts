interface ProbePage {
  url(): string;
  title(): Promise<string>;
}
interface ProbeContext {
  newPage(): Promise<ProbePage>;
  close(): Promise<void>;
}
interface ProbeBrowser {
  newContext(): Promise<ProbeContext>;
}

/** Exercise only the engine's blank document, before creating the test's fresh app context. */
export async function checkBrowserReadiness(browser: ProbeBrowser, now: () => number = () => performance.now()) {
  const started = now();
  const context = await browser.newContext();
  const contextReady = now();
  let pageReady = contextReady;
  let roundTripReady = contextReady;
  try {
    const page = await context.newPage();
    pageReady = now();
    if (page.url() !== 'about:blank') throw new Error('Engine readiness requires a blank document');
    await page.title();
    roundTripReady = now();
  } finally {
    await context.close();
  }
  return { contextMs: contextReady - started, pageMs: pageReady - contextReady, roundTripMs: roundTripReady - pageReady, totalMs: now() - started };
}
