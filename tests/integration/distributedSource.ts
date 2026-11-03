import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** JSDOM eval is a classic script; supply the real module metadata used by Vite's
 * asset imports. All application code and existing assertions remain active.
 * Actual ES-module loading, image decoding and colors are checked in browsers. */
export function distributedSource(): string {
  const asset = readdirSync('dist/assets').find((name) => /^index-.*\.js$/.test(name));
  if (!asset) throw Error('Build before running UI integration tests');
  const moduleUrl = new URL(asset, 'http://localhost/assets/').href;
  return (
    // JSDOM has no cross-document LockManager. Supply the successful browser API
    // for existing UI flows; explicit own-property fixtures can test denial.
    // Actual shared locking, contention and page lifecycle run in three browsers.
    `if (!Object.prototype.hasOwnProperty.call(navigator, 'locks')) Object.defineProperty(navigator, 'locks', { value: { request(name, options, callback) { return Promise.resolve(callback({ name, mode: 'exclusive' })); } } });\n` +
    readFileSync(resolve('dist/assets', asset), 'utf8')
      .replaceAll('import.meta', `({ url: ${JSON.stringify(moduleUrl)} })`)
      // Code splitting may export shared game helpers from the entry chunk.
      // Classic-script JSDOM evaluation has no module consumer for these bindings.
      // Browser tests exercise the unmodified entry and its real module graph.
      .replace(/export\s*\{[^}]*\};?\s*$/u, '')
  );
}
