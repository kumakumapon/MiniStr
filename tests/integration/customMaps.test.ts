import { distributedSource } from './distributedSource';
import { afterEach, expect, it } from 'vitest';
// @ts-expect-error Optional JSDOM declarations are not required by this project.
import { JSDOM } from 'jsdom';
import { operationData } from '../../src/game/operations.fixture';

const source = distributedSource();
const catalogKey = 'ministr.scenarios.custom';
const saveKey = 'ministr.save.manual';
let dom: JSDOM;
function launch(locale = 'ja') {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(dom.window, { structuredClone, TextEncoder, TextDecoder });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.confirm = () => true;
  dom.window.localStorage.setItem('ministr.locale', locale);
  dom.window.localStorage.setItem(
    catalogKey,
    JSON.stringify({ schemaVersion: 1, scenarios: [operationData({ id: 'custom-delete', name: '戦車' }), operationData({ id: 'custom-keep', name: '残す作戦' })], history: [] }),
  );
  dom.window.eval(source);
  return dom.window.document;
}
function click(selector: string) {
  const element = dom.window.document.querySelector(selector);
  if (!element) throw Error(`Missing ${selector}`);
  element.click();
}
afterEach(() => dom?.window.close());

it.each(['ja', 'en'])('confirms deletion in %s and keeps the running match and saved state', (locale) => {
  const document = launch(locale);
  expect(document.querySelectorAll('[data-delete-custom-map]')).toHaveLength(2);
  expect(document.querySelector('#title-delete-skirmish')).toBeNull();
  click('.title-map-card[data-map-id="custom-delete"]');
  click('#begin-operation');
  click('#save');
  const saved = dom.window.localStorage.getItem(saveKey);
  expect(saved).not.toBeNull();
  click('#open-title');
  let confirmation = '';
  dom.window.confirm = (message: string) => {
    confirmation = message;
    return false;
  };
  const before = dom.window.localStorage.getItem(catalogKey);
  click('#title-delete-custom-delete');
  expect(confirmation).toContain('戦車');
  expect(confirmation).toContain(locale === 'en' ? 'current match' : '進行中の対局');
  expect(dom.window.localStorage.getItem(catalogKey)).toBe(before);
  dom.window.confirm = () => true;
  click('#title-delete-custom-delete');
  expect(document.querySelector('.title-map-card[data-map-id="custom-delete"]')).toBeNull();
  expect(document.querySelector('.title-map-card[data-map-id="custom-keep"]')).not.toBeNull();
  expect(document.querySelector('.title-notice')?.textContent).toBe(locale === 'en' ? 'Removed "戦車" from the map list.' : '「戦車」をマップ一覧から削除しました。');
  expect(dom.window.localStorage.getItem(saveKey)).toBe(saved);
  click('#title-resume');
  expect(document.querySelector('.battlefield-heading h2')?.textContent).toBe('戦車');
  click('#continue');
  expect(document.querySelector('.battlefield-heading h2')?.textContent).toBe('戦車');
  expect(JSON.parse(dom.window.localStorage.getItem(catalogKey)).scenarios.map((map: { id: string }) => map.id)).toEqual(['custom-keep']);
});

it('keeps the map and reports an error when catalog persistence fails', () => {
  const document = launch();
  const before = dom.window.localStorage.getItem(catalogKey);
  const original = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = function (key: string, value: string) {
    if (key === catalogKey) throw Error('QuotaExceededError');
    original.call(this, key, value);
  };
  click('#title-delete-custom-delete');
  expect(document.querySelector('.title-map-card[data-map-id="custom-delete"]')).not.toBeNull();
  expect(document.querySelector('.title-notice')?.textContent).toContain('削除できませんでした');
  expect(dom.window.localStorage.getItem(catalogKey)).toBe(before);
});

it.each(['finite', 'unlimited'])('records the chosen %s supply rule and restores it from a save', (mode) => {
  const document = launch('en');
  click('.title-map-card[data-map-id="custom-delete"]');
  const select = document.querySelector('#briefing-supply-mode');
  select.value = mode;
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  click('#begin-operation');
  click('.tile[data-x="0"][data-y="2"]');
  expect(document.querySelector('#unit-brief')?.textContent.includes('Supply stock')).toBe(mode === 'finite');
  click('#save');
  const saved = JSON.parse(dom.window.localStorage.getItem(saveKey));
  expect(saved.initialState.ruleVersion).toBe(mode === 'finite' ? 12 : 9);
  click('#continue');
  click('.tile[data-x="0"][data-y="2"]');
  expect(document.querySelector('#unit-brief')?.textContent.includes('Supply stock')).toBe(mode === 'finite');
});
