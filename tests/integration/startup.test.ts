import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// jsdom is intentionally instantiated per test: startup listeners/timers cannot leak between apps.
// @ts-expect-error The runtime is a dev dependency; production/test source does not require its optional declaration package.
import { JSDOM } from 'jsdom';
import { createScenarioInitialState, maps, saveGameToSlot, type StorageLike } from '../../src/game';

const asset = readdirSync('dist/assets').find((name) => /^index-.*\.js$/.test(name));
if (!asset) throw Error('Run npm run build before production UI tests');
const source = readFileSync(resolve('dist/assets', asset), 'utf8');
let dom: JSDOM;
function launch(options: { storage?: Record<string, string>; denied?: boolean } = {}) {
  dom = new JSDOM('<!doctype html><html lang="ja"><body><div id="app"></div></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(dom.window, { structuredClone, TextEncoder, TextDecoder });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.confirm = () => true;
  dom.window.prompt = () => 'test save';
  for (const [key, value] of Object.entries(options.storage ?? {})) dom.window.localStorage.setItem(key, value);
  if (options.denied)
    Object.defineProperty(dom.window, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
    });
  dom.window.eval(source);
  return dom.window.document;
}
function click(selector: string) {
  const element = dom.window.document.querySelector(selector);
  if (!element) throw Error(`Missing UI: ${selector}`);
  element.click();
}
afterEach(() => dom?.window.close());

describe('distributed application boundaries', () => {
  it('starts with unavailable storage and can play a practice operation', () => {
    const document = launch({ denied: true });
    expect(document.body.textContent).toContain('保存領域を利用できません');
    click('#title-training');
    click('#begin-operation');
    expect(document.querySelector('.board')).not.toBeNull();
    expect(document.querySelector('#learning-panel')?.hasAttribute('open')).toBe(true);
    click('.tile[data-x="0"][data-y="1"]');
    click('.tile[data-x="0"][data-y="2"]');
    expect(document.querySelector('.status-message')?.textContent).toContain('移動');
    click('#save');
    expect(document.querySelector('.status-message')?.textContent).toContain('セーブ');
  });

  it('offers named-only saves on startup and resumes the selected one', () => {
    const data: Record<string, string> = {};
    const storage: StorageLike = {
      getItem: (key) => data[key] ?? null,
      setItem: (key, value) => {
        data[key] = value;
      },
      removeItem: (key) => {
        delete data[key];
      },
    };
    const initialState = createScenarioInitialState(maps[0]!);
    saveGameToSlot(storage, 'named', 'Only named', { mapId: maps[0]!.id, difficulty: 'normal', initialState, gameState: initialState, commands: [] });
    const document = launch({ storage: data });
    expect(document.querySelector('#title-continue')?.hasAttribute('disabled')).toBe(false);
    click('.load-save-slot[data-save-slot="named"]');
    expect(document.querySelector('.title-overlay')).toBeNull();
    expect(document.querySelector('.board')).not.toBeNull();
    expect(document.querySelector('.resource-row.enemy')?.textContent).toContain('不明');
  });

  it('keeps the board when loading fails and exposes invalid entries for deletion', () => {
    const document = launch();
    click('.title-map-card[data-map-id="skirmish"]');
    click('#begin-operation');
    click('.tile[data-x="0"][data-y="1"]');
    click('.tile[data-x="0"][data-y="2"]');
    const before = document.querySelector('.board')?.innerHTML;
    dom.window.localStorage.setItem('ministr.save.manual', '{broken');
    // Invoke the guarded menu handler even though the continue button reflects valid-save presence.
    document.querySelector('#continue')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.board')?.innerHTML).toBe(before);
    click('#open-title');
    expect(document.querySelector('.load-save-slot[data-save-slot="manual"]')?.hasAttribute('disabled')).toBe(true);
    click('.delete-save-slot[data-save-slot="manual"]');
    expect(dom.window.localStorage.getItem('ministr.save.manual')).toBeNull();
    click('#title-resume');
    expect(document.querySelector('.board')?.innerHTML).toBe(before);
  });

  it('opens editor, blocks empty operation, paints and undoes without losing the draft', () => {
    const document = launch();
    click('#title-editor');
    click('#editor-start');
    expect(document.querySelector('.editor-overlay')).not.toBeNull();
    expect(document.querySelector('.editor-notice')?.textContent).toContain('司令部');
    const terrain = document.querySelector('#editor-terrain') as HTMLSelectElement;
    terrain.value = 'forest';
    terrain.dispatchEvent(new dom.window.Event('change'));
    click('.editor-tile[data-editor-x="1"][data-editor-y="1"]');
    expect(document.querySelector('.editor-tile[data-editor-x="1"][data-editor-y="1"]')?.classList.contains('forest')).toBe(true);
    click('#editor-undo');
    expect(document.querySelector('.editor-tile[data-editor-x="1"][data-editor-y="1"]')?.classList.contains('plain')).toBe(true);
    click('#editor-redo');
    click('#editor-save');
    expect(dom.window.localStorage.getItem('ministr.scenarios.custom')).toContain('forest');
    click('#editor-close');
    expect(document.querySelector('.title-overlay')).not.toBeNull();
  });

  it('preserves an active match when replacement is cancelled, and closes the editor with Escape', () => {
    const document = launch();
    click('#title-training');
    click('#begin-operation');
    click('.tile[data-x="0"][data-y="1"]');
    click('.tile[data-x="0"][data-y="2"]');
    dom.window.confirm = () => false;
    click('#open-title');
    click('.title-map-card[data-map-id="canyon"]');
    expect(document.querySelector('.title-overlay')).not.toBeNull();
    click('#title-resume');
    expect(document.querySelector('.tile[data-x="0"][data-y="2"]')?.textContent).toContain('歩');
    click('#open-editor');
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.editor-overlay')).toBeNull();
  });

  it('switches primary screens and persists English without changing scenario identifiers', () => {
    const document = launch();
    const locale = document.querySelector('.title-overlay [data-locale]') as HTMLSelectElement;
    locale.value = 'en';
    locale.dispatchEvent(new dom.window.Event('change'));
    expect(document.documentElement.lang).toBe('en');
    expect(document.querySelector('#title-training')?.textContent).toBe('Practice the basics');
    expect(dom.window.localStorage.getItem('ministr.locale')).toBe('en');
    click('.title-map-card[data-map-id="skirmish"]');
    expect(document.querySelector('#begin-operation')?.textContent).toContain('Start');
  });

  it('stops writes on changes from another tab', () => {
    const document = launch();
    click('.title-map-card[data-map-id="skirmish"]');
    click('#begin-operation');
    dom.window.dispatchEvent(new dom.window.StorageEvent('storage', { key: 'ministr.save.manual', newValue: 'changed externally' }));
    click('#save');
    expect(document.body.textContent).toContain('別のタブ');
    expect(dom.window.localStorage.getItem('ministr.save.manual')).toBeNull();
  });
});
