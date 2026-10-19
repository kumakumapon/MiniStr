import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error jsdom is a runtime development dependency, as in startup.test.ts.
import { JSDOM } from 'jsdom';
import { finishedDefense, scanScenarioData } from '../operationsExpansion.fixture';
import { OPERATION_RECORDS_KEY } from '../../src/game/operationRecords';
import { MANUAL_SAVE_KEY } from '../../src/game/session';

const asset = readdirSync('dist/assets').find((name) => /^index-.*\.js$/.test(name));
if (!asset) throw Error('Build the product before UI tests');
const source = readFileSync(resolve('dist/assets', asset), 'utf8');
let dom: JSDOM;
function launch(storage: Record<string, string> = {}) {
  dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(dom.window, { structuredClone, TextEncoder, TextDecoder });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.confirm = () => true;
  for (const [key, value] of Object.entries(storage)) dom.window.localStorage.setItem(key, value);
  dom.window.eval(source);
  return dom.window.document;
}
function click(selector: string) {
  const element = dom.window.document.querySelector(selector);
  if (!element) throw Error(`Missing ${selector}`);
  element.click();
}
function change(selector: string, value: string) {
  const element = dom.window.document.querySelector(selector);
  if (!element) throw Error(`Missing ${selector}`);
  element.value = value;
  element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}
function stored() {
  const values: Record<string, string> = {};
  for (let index = 0; index < dom.window.localStorage.length; index++) {
    const key = dom.window.localStorage.key(index)!;
    values[key] = dom.window.localStorage.getItem(key)!;
  }
  return values;
}
afterEach(() => dom?.window.close());
describe('distributed recon, control and operation records', () => {
  it('targets, cancels, undoes and restores scans without retaining vision into the next turn', () => {
    let document = launch();
    click('#title-editor');
    change('#editor-json', JSON.stringify(scanScenarioData()));
    click('#editor-import');
    click('#editor-start');
    click('#begin-operation');
    expect(document.querySelector('.tile[data-x="7"][data-y="2"] .unit')).toBeNull();
    click('#recon-target');
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('#recon-cancel')).toBeNull();
    click('#recon-target');
    click('.tile[data-x="6"][data-y="2"]');
    expect(document.querySelector('#recon-target')?.textContent).toContain('残り1回');
    expect(document.querySelector('.tile[data-x="7"][data-y="2"] .unit')).not.toBeNull();
    click('#undo');
    expect(document.querySelector('#recon-target')?.textContent).toContain('残り2回');
    expect(document.querySelector('.tile[data-x="7"][data-y="2"] .unit')).toBeNull();
    click('#recon-target');
    click('.tile[data-x="6"][data-y="2"]');
    click('#save');
    const values = stored();
    dom.window.close();
    document = launch(values);
    click('.load-save-slot[data-save-slot="manual"]');
    expect(document.querySelector('#recon-target')?.textContent).toContain('残り1回');
    click('#open-title');
    click('#title-editor');
    change('#editor-json', JSON.stringify(scanScenarioData()));
    click('#editor-import');
    click('#editor-start');
    click('input[name="match-mode"][value="hotseat"]');
    click('#begin-operation');
    click('#recon-target');
    click('.tile[data-x="6"][data-y="2"]');
    click('#end');
    click('#handoff-start');
    click('#end');
    click('#handoff-start');
    expect(document.querySelector('.tile[data-x="7"][data-y="2"] .unit')).toBeNull();
    expect(document.querySelector('#recon-target')?.textContent).toContain('残り1回');
    expect(dom.window.localStorage.getItem(OPERATION_RECORDS_KEY)).toBeNull();
  });
  it('records completed human operations idempotently and presents conditions and challenge results', () => {
    let document = launch({ [MANUAL_SAVE_KEY]: finishedDefense().serialized });
    click('.load-save-slot[data-save-slot="manual"]');
    expect(document.querySelector('.game-over .operation-challenges')?.textContent).toContain('達成');
    const first = dom.window.localStorage.getItem(OPERATION_RECORDS_KEY)!;
    expect(JSON.parse(first).records).toHaveLength(1);
    click('#result-title-menu');
    expect(document.querySelector('.title-map-card[data-map-id="frontier-defense"]')?.textContent).toContain('クリア記録あり');
    click('#operation-records summary');
    expect(document.querySelector('#operation-records')?.textContent).toContain('標準編成');
    const values = stored();
    dom.window.close();
    document = launch(values);
    click('.load-save-slot[data-save-slot="manual"]');
    expect(dom.window.localStorage.getItem(OPERATION_RECORDS_KEY)).toBe(first);
    click('#view-replay');
    expect(dom.window.localStorage.getItem(OPERATION_RECORDS_KEY)).toBe(first);
    dom.window.close();
    launch({ [MANUAL_SAVE_KEY]: finishedDefense('spectate').serialized });
    click('.load-save-slot[data-save-slot="manual"]');
    expect(dom.window.localStorage.getItem(OPERATION_RECORDS_KEY)).toBeNull();
  });
  it('recovers corrupt records without deleting matches and supports per-condition deletion', () => {
    const save = finishedDefense().serialized;
    let document = launch({ [MANUAL_SAVE_KEY]: save, [OPERATION_RECORDS_KEY]: '{broken' });
    expect(document.querySelector('#operation-records [role=alert]')).not.toBeNull();
    click('#operation-records-reset');
    expect(dom.window.localStorage.getItem(MANUAL_SAVE_KEY)).toBe(save);
    click('.load-save-slot[data-save-slot="manual"]');
    click('#result-title-menu');
    click('[data-record-delete="0"]');
    expect(JSON.parse(dom.window.localStorage.getItem(OPERATION_RECORDS_KEY)!).records).toEqual([]);
    expect(document.querySelector('#operation-records')?.textContent).toContain('まだありません');
    dom.window.close();
    document = launch({ [MANUAL_SAVE_KEY]: finishedDefense('hotseat').serialized });
    click('.load-save-slot[data-save-slot="manual"]');
    expect(dom.window.localStorage.getItem(OPERATION_RECORDS_KEY)).toBeNull();
  });
  it('offers both control operations and exports a mirrored public scoring condition in the editor', () => {
    const document = launch();
    expect(document.querySelector('.title-map-card[data-map-id="control-crossroads"]')).not.toBeNull();
    expect(document.querySelector('.title-map-card[data-map-id="control-coast"]')).not.toBeNull();
    click('#title-editor');
    const data = scanScenarioData();
    data.board.cells = [[0, 0, 'city']];
    change('#editor-json', JSON.stringify(data));
    click('#editor-import');
    change('#editor-victory', 'control');
    change('#editor-victory-target', '5');
    document.querySelector('#editor-victory-target')!.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    click('#editor-export');
    const exported = JSON.parse(document.querySelector<HTMLTextAreaElement>('#editor-json')!.value);
    expect(exported.victoryConditions[0]).toEqual({ type: 'control', positions: [{ x: 0, y: 0 }], target: 5 });
    expect(exported.defeatConditions).toEqual(exported.victoryConditions);
    click('#editor-validate');
    expect(document.querySelector('#editor-notice')?.textContent).toContain('成功');
  });
});
