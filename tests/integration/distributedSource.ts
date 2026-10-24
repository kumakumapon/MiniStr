import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** JSDOM eval is a classic script; supply the real module URL used by Vite's
 * asset imports. All application code and existing assertions remain active.
 * Actual ES-module loading, image decoding and colors are checked in browsers. */
export function distributedSource(): string {
  const asset = readdirSync('dist/assets').find((name) => /^index-.*\.js$/.test(name));
  if (!asset) throw Error('Build before running UI integration tests');
  const moduleUrl = new URL(asset, 'http://localhost/assets/').href;
  return readFileSync(resolve('dist/assets', asset), 'utf8').replaceAll('import.meta.url', JSON.stringify(moduleUrl));
}
