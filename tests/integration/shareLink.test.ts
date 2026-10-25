import { distributedSource } from './distributedSource';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error The runtime is a dev dependency; production/test source does not require its optional declaration package.
import { JSDOM } from 'jsdom';
import { operationData } from '../../src/game/operations.fixture';

const source = distributedSource();
const VALID = '#ministr-gen1/2/16/none/standard/Share-1';
const FRONT = '#ministr-gen1/3/16/none/frontline/Share-2';
let dom: JSDOM;

function launch(hash = '', storage: Record<string, string> = {}) {
  dom = new JSDOM('<!doctype html><html lang="ja"><body><div id="app"></div></body></html>', {
    url: `http://localhost/play/${hash}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  Object.assign(dom.window, { structuredClone, TextEncoder, TextDecoder });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.confirm = () => true;
  dom.window.prompt = () => 'test save';
  for (const [key, value] of Object.entries(storage)) dom.window.localStorage.setItem(key, value);
  dom.window.eval(source);
  return dom.window.document;
}
const snapshot = () => {
  const result: Record<string, string> = {};
  for (let at = 0; at < dom.window.localStorage.length; at++) {
    const key = dom.window.localStorage.key(at)!;
    result[key] = dom.window.localStorage.getItem(key)!;
  }
  return result;
};
const q = (selector: string) => dom.window.document.querySelector<HTMLElement>(selector);
const click = (selector: string) => {
  const element = q(selector);
  if (!element) throw Error(`Missing UI: ${selector}`);
  element.click();
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const dialogs = () => dom.window.document.querySelectorAll('[role="dialog"]').length;
const hashChange = async (hash: string) => {
  dom.window.location.hash = hash;
  await settle();
};
const customIds = () => {
  const raw = dom.window.localStorage.getItem('ministr.scenarios.custom');
  return raw ? (JSON.parse(raw) as { scenarios: { id: string }[] }).scenarios.map((scenario) => scenario.id) : [];
};

afterEach(() => dom?.window.close());

const seeded = () => ({
  'ministr.scenarios.custom': JSON.stringify({ schemaVersion: 1, scenarios: [operationData({ id: 'custom-keep', name: '残す作戦' })], history: [] }),
  'ministr.sample.unrelated': 'keep-me',
});

describe('share link in the distributed application', () => {
  it('opens a confirmation as the only dialog, focused on cancel, without writing storage', async () => {
    launch(VALID, seeded());
    await settle();
    expect(dialogs()).toBe(1);
    expect(q('.title-overlay')).toBeNull();
    expect(q('#share-link-title')?.textContent).toBe('共有リンクの戦域を開く');
    expect(q('.share-link-facts')?.textContent).toContain('16×12');
    expect(q('.share-link-facts')?.textContent).toContain('Share-1');
    expect(q('main')?.hasAttribute('inert')).toBe(true);
    expect(dom.window.document.activeElement?.id).toBe('share-link-cancel');
    expect(snapshot()).toEqual({ ...seeded(), ...snapshot() });
    expect(snapshot()['ministr.scenarios.custom']).toBe(seeded()['ministr.scenarios.custom']);
    expect(dom.window.location.hash).toBe(VALID);
  });

  it('cancel and Escape write nothing, clear the hash and bring the title back', async () => {
    launch(VALID, seeded());
    await settle();
    const before = snapshot();
    click('#share-link-cancel');
    await settle();
    expect(dialogs()).toBe(1);
    expect(q('.title-overlay')).not.toBeNull();
    expect(q('#share-link-title')).toBeNull();
    expect(dom.window.location.hash).toBe('');
    expect(dom.window.location.pathname).toBe('/play/');
    expect(snapshot()).toEqual(before);
    await hashChange(VALID);
    expect(q('#share-link-title')).not.toBeNull();
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(q('#share-link-title')).toBeNull();
    expect(dom.window.location.hash).toBe('');
    expect(snapshot()).toEqual(before);
  });

  it('confirming adds one custom operation, keeps everything else, and opens the briefing', async () => {
    launch(VALID, seeded());
    await settle();
    const before = snapshot();
    click('#share-link-confirm');
    await settle();
    expect(q('#briefing-title')?.textContent).toContain('Share-1');
    expect(dialogs()).toBe(1);
    expect(dom.window.location.hash).toBe('');
    expect(customIds()).toEqual(['custom-keep', 'generated-v2-16-none-Share-1']);
    const after = snapshot();
    for (const key of Object.keys(before)) if (key !== 'ministr.scenarios.custom') expect(after[key], key).toBe(before[key]);
    // Saving re-serializes the catalog with defaults filled in (existing behaviour), so compare content, not bytes.
    expect(JSON.parse(after['ministr.scenarios.custom']!).scenarios[0]).toMatchObject(JSON.parse(before['ministr.scenarios.custom']!).scenarios[0]);
  });

  it('does not duplicate when the same link is confirmed twice', async () => {
    launch(VALID);
    await settle();
    click('#share-link-confirm');
    await settle();
    click('#briefing-back-to-title');
    await settle();
    await hashChange(VALID);
    expect(q('#share-link-title')).not.toBeNull();
    click('#share-link-confirm');
    await settle();
    expect(customIds()).toEqual(['generated-v2-16-none-Share-1']);
  });

  it('refuses invalid, unsupported and daily-style links with a notice and changes nothing', async () => {
    const hashes = [
      '#ministr-gen1/1/16/none/standard/a',
      '#ministr-gen1/2/17/none/standard/a',
      '#ministr-gen1/2/16/none/standard/%41',
      '#ministr-gen1/2/16/none/standard/D20260501',
      `#ministr-gen1/2/16/none/standard/${'a'.repeat(5000)}`,
      '#ministr-gen2/2/16/none/standard/a',
    ];
    for (const hash of hashes) {
      launch(hash, seeded());
      await settle();
      expect(q('#share-link-title'), hash.slice(0, 40)).toBeNull();
      expect(dialogs()).toBe(1);
      expect(q('.title-notice')?.textContent).toMatch(/共有リンク|日替わり/);
      expect(dom.window.location.hash).toBe('');
      expect(snapshot()['ministr.scenarios.custom']).toBe(seeded()['ministr.scenarios.custom']);
      expect(snapshot()['ministr.sample.unrelated']).toBe('keep-me');
      expect(Object.keys(snapshot()).filter((key) => key.startsWith('ministr.save') || key.includes('daily'))).toEqual([]);
      dom.window.close();
    }
  });

  it('ignores unrelated hashes and leaves them in the address bar', async () => {
    launch('#section');
    await settle();
    expect(q('#share-link-title')).toBeNull();
    expect(q('.title-notice')?.textContent ?? '').not.toMatch(/共有リンク/);
    expect(dom.window.location.hash).toBe('#section');
  });

  it('holds a link that arrives behind other screens and shows it only when the title returns', async () => {
    launch();
    await settle();
    // Editor
    click('#title-editor');
    await settle();
    await hashChange(VALID);
    expect(q('#editor-close')).not.toBeNull();
    expect(q('#share-link-title')).toBeNull();
    expect(dialogs()).toBe(1);
    expect(dom.window.location.hash).toBe(VALID);
    click('#editor-close');
    await settle();
    expect(q('#share-link-title')).not.toBeNull();
    expect(dialogs()).toBe(1);
    click('#share-link-cancel');
    await settle();
    // Campaign menu
    click('#title-campaign');
    await settle();
    await hashChange(FRONT);
    expect(q('#campaign-close')).not.toBeNull();
    expect(q('#share-link-title')).toBeNull();
    expect(dialogs()).toBe(1);
    click('#campaign-close');
    await settle();
    expect(q('#share-link-facts, .share-link-facts')?.textContent).toContain('Share-2');
    click('#share-link-cancel');
    await settle();
    // Briefing and a running match
    click('#title-training');
    await settle();
    await hashChange(VALID);
    expect(q('#begin-operation')).not.toBeNull();
    expect(q('#share-link-title')).toBeNull();
    expect(dialogs()).toBe(1);
    click('#begin-operation');
    await settle();
    expect(q('#share-link-title')).toBeNull();
    expect(dialogs()).toBe(0);
    click('#open-title');
    await settle();
    expect(q('#share-link-title')).not.toBeNull();
    expect(dialogs()).toBe(1);
  });

  it('replaces a waiting link with a newer valid one and keeps it through an invalid one', async () => {
    launch();
    await settle();
    click('#title-editor');
    await settle();
    await hashChange(VALID);
    await hashChange(FRONT);
    await hashChange('#ministr-gen1/9/16/none/standard/a');
    expect(dom.window.location.hash).toBe('');
    click('#editor-close');
    await settle();
    expect(q('.share-link-facts')?.textContent).toContain('Share-2');
    expect(q('.share-link-facts')?.textContent).not.toContain('Share-1');
  });

  it('shows the playable frontline preset and starts it', async () => {
    launch(FRONT);
    await settle();
    expect(q('.share-link-facts')?.textContent).toContain('前線補給・工兵');
    click('#share-link-confirm');
    await settle();
    expect(customIds()).toEqual(['generated-v3-frontline-16-none-Share-2']);
  });

  it('keeps the dialog and the link when the library is full, then allows a retry', async () => {
    const full = {
      schemaVersion: 1,
      scenarios: Array.from({ length: 32 }, (_, at) => operationData({ id: `custom-fill-${at}`, name: `fill ${at}` })),
      history: [],
    };
    launch(VALID, { 'ministr.scenarios.custom': JSON.stringify(full) });
    await settle();
    const before = snapshot();
    click('#share-link-confirm');
    await settle();
    expect(q('#share-link-title')).not.toBeNull();
    expect(q('#share-link-status')?.textContent).toContain('上限');
    expect(dom.window.document.activeElement?.id).toBe('share-link-confirm');
    expect(dom.window.location.hash).toBe(VALID);
    expect(q('#briefing-title')).toBeNull();
    expect(snapshot()).toEqual(before);
  });

  it('copies the link of the generator form', async () => {
    const written: string[] = [];
    launch();
    Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: (value: string) => (written.push(value), Promise.resolve()) }, configurable: true });
    const select = q('#title-generator-size') as HTMLSelectElement;
    select.value = '24';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    click('#title-generator-copy-link');
    await settle();
    expect(written).toEqual(['http://localhost/play/#ministr-gen1/2/24/coast/standard/MiniStr-1']);
    expect(q('#title-generator-link-status')?.textContent).toBe('共有リンクをコピーしました。');
  });
});
