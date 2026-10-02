/** Injected by Vite; tests and local non-Vite consumers still have a label. */
export const buildInfo = typeof __BUILD_INFO__ === 'undefined' ? { version: 'development', sha: 'unknown' } : __BUILD_INFO__;

export function diagnosticReport(options: { persistent: boolean; bytes: number; locale: string; viewport: { width: number; height: number } }): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      build: buildInfo,
      storageAvailable: options.persistent,
      storageBytes: options.bytes,
      locale: options.locale,
      viewport: options.viewport,
      online: navigator.onLine,
      // Deliberately exclude save contents, map names, commands, URL and user agent.
    },
    null,
    2,
  );
}
