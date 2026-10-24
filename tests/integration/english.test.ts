import { distributedSource } from './distributedSource';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error jsdom does not require an optional declaration package in production.
import { JSDOM } from 'jsdom';
import { maps, operationScenarios } from '../../src/game/maps';
import { operationData } from '../../src/game/operations.fixture';

const source = distributedSource();
const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
let dom: JSDOM;
let dialogs: string[];

function launch() {
  dialogs = [];
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(dom.window, { structuredClone, TextEncoder, TextDecoder });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.confirm = (text: string) => {
    dialogs.push(text);
    return true;
  };
  dom.window.prompt = (text: string) => {
    dialogs.push(text);
    return '丘の隊';
  };
  dom.window.localStorage.setItem('ministr.locale', 'en');
  dom.window.eval(source);
  return dom.window.document;
}
function click(selector: string) {
  const element = dom.window.document.querySelector(selector);
  if (!element) throw new Error(`Missing control: ${selector}`);
  element.click();
}
function change(selector: string, value: string) {
  const element = dom.window.document.querySelector(selector);
  if (!element) throw new Error(`Missing control: ${selector}`);
  element.value = value;
  element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}
function expectEnglish(label: string, authored: readonly string[] = []) {
  const document = dom.window.document;
  const protectedContent = 'textarea,script,style,[data-user-content],.title-map-name,.briefing-copy,.save-slot-manager strong';
  const walker = document.createTreeWalker(document.querySelector('#app'), dom.window.NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest(protectedContent)) continue;
    expect(
      authored.reduce((text, name) => text.replaceAll(name, ''), node.textContent ?? ''),
      `${label}: ${node.parentElement?.outerHTML}`,
    ).not.toMatch(japanese);
  }
  for (const element of document.querySelectorAll('[aria-label],[title],[alt],[placeholder],[label]')) {
    if (element.closest('[data-user-content]')) continue;
    for (const attribute of ['aria-label', 'title', 'alt', 'placeholder', 'label']) {
      if (element.dataset.userAttributes?.split(' ').includes(attribute)) continue;
      expect(element.getAttribute(attribute) ?? '', `${label}: ${element.outerHTML}`).not.toMatch(japanese);
    }
  }
}
afterEach(() => dom?.window.close());

describe('English distributed UI', () => {
  it('keeps every built-in briefing and deployment panel in English', () => {
    const document = launch();
    expectEnglish('title');
    for (const scenario of [...maps, ...operationScenarios]) {
      click(`.title-map-card[data-map-id="${scenario.id}"]`);
      expect(document.querySelector('#briefing-title')?.textContent, scenario.id).not.toMatch(japanese);
      expect(document.querySelector('#briefing-copy')?.textContent, scenario.id).not.toMatch(japanese);
      expectEnglish(scenario.id);
      click('#briefing-back-to-title');
    }
  }, 45_000);

  it('covers practice, unit information, production, saves, campaign and the editor', () => {
    const document = launch();
    click('#title-training');
    click('#begin-operation');
    click('.tile[data-x="0"][data-y="1"]');
    expectEnglish('selected unit');
    expect(document.querySelector('.command-tip')?.textContent).toContain('Infantry can capture neutral and enemy cities');
    click('#open-production');
    expectEnglish('production');
    click('#production-menu-close');
    click('#save');
    expectEnglish('manual save');
    click('#save-new-slot');
    click('#open-title');
    expect([...document.querySelectorAll('.save-slot-manager strong')].map((node) => node.textContent)).toContain('丘の隊');
    expect(document.querySelector('.status-message')?.textContent).toBe('Saved as "丘の隊".');
    expectEnglish('named save', ['丘の隊']);
    click('#title-campaign');
    expectEnglish('campaign', ['丘の隊']);
    click('.campaign-start:not([disabled])');
    expect(document.querySelector('#briefing-copy')?.textContent).not.toMatch(japanese);
    expectEnglish('campaign briefing');
    click('#begin-operation');
    click('#open-title');
    click('#title-editor');
    expectEnglish('editor');
    for (const text of dialogs) expect(text).not.toMatch(japanese);
  });

  it('keeps custom names, authored briefings and saved JSON unchanged across language changes', () => {
    const document = launch();
    click('#title-editor');
    const data = operationData({ id: 'custom-language', name: '占領', briefing: '利用者の作戦説明は翻訳しない' });
    const editorJson = document.querySelector('#editor-json');
    editorJson.value = JSON.stringify(data);
    click('#editor-import');
    expect(document.querySelector('#editor-name')?.value).toBe(data.name);
    expect(document.querySelector('#editor-briefing')?.value).toBe(data.briefing);
    click('#editor-start');
    expect(document.querySelector('#briefing-title')?.textContent).toBe(data.name);
    expect(document.querySelector('#briefing-copy')?.textContent).toBe(data.briefing);
    click('#begin-operation');
    click('#save');
    click('#save-new-slot');
    click('#open-title');
    const before = new Map<string, string>();
    for (let index = 0; index < dom.window.localStorage.length; index++) {
      const key = dom.window.localStorage.key(index)!;
      if (key !== 'ministr.locale') before.set(key, dom.window.localStorage.getItem(key)!);
    }
    change('.title-menu [data-locale]', 'ja');
    expect(document.documentElement.lang).toBe('ja');
    expect(document.querySelector('#title-training')?.textContent).toBe('基本操作を練習');
    change('.title-menu [data-locale]', 'en');
    expect(document.querySelector('#title-training')?.textContent).toBe('Practice the basics');
    expect(document.querySelector('.title-map-card[data-map-id="custom-language"] .title-map-name')?.textContent).toContain(data.name);
    expect([...document.querySelectorAll('.save-slot-manager strong')].map((node) => node.textContent)).toContain('丘の隊');
    for (const [key, value] of before) expect(dom.window.localStorage.getItem(key), key).toBe(value);
    expectEnglish('English after round trip');
    click('#title-editor');
    expect(document.querySelector('#editor-catalog option[value="custom-language"]')?.textContent).toBe(data.name);
    expectEnglish('editor with authored map name');
  });

  it('localizes generated standard and frontline map metadata after saving and reopening', () => {
    const document = launch();
    for (const preset of ['standard', 'frontline']) {
      change('#title-generator-size', '16');
      change('#title-generator-preset', preset);
      document.querySelector('#title-generator-seed').value = `english-${preset}`;
      click('#title-generator-create');
      expect(document.querySelector('#briefing-title')?.textContent).not.toMatch(japanese);
      expect(document.querySelector('#briefing-copy')?.textContent).not.toMatch(japanese);
      expectEnglish(`generated ${preset}`);
      click('#briefing-back-to-title');
    }
  });
});
