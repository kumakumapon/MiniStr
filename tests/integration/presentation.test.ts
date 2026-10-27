import { afterEach, expect, it } from 'vitest';
// @ts-expect-error Optional JSDOM declarations are not shipped by the application.
import { JSDOM } from 'jsdom';
import { distributedSource } from './distributedSource';

const source = distributedSource();
let dom: JSDOM;
function launch(locale = 'ja') {
  dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(dom.window, { structuredClone, TextEncoder, TextDecoder });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.confirm = () => true;
  dom.window.localStorage.setItem('ministr.locale', locale);
  dom.window.localStorage.setItem('ministr.music.settings', JSON.stringify({ muted: true, volume: 0.37, fieldTrack: 'mist' }));
  dom.window.eval(source);
  return dom.window.document;
}
function change(selector: string, value: string, event = 'change') {
  const element = dom.window.document.querySelector(selector);
  element.value = value;
  element.dispatchEvent(new dom.window.Event(event, { bubbles: true }));
}
afterEach(() => dom?.window.close());

it.each(['ja', 'en'])('migrates preferences and synchronizes title and match controls in %s', (locale) => {
  const document = launch(locale);
  expect(document.querySelector('#title-music-track').value).toBe('mist');
  expect(document.querySelector('#title-music-volume').value).toBe('37');
  expect(document.querySelector('#title-music-muted').checked).toBe(false);
  const control = document.querySelector('#title-music-track');
  control.focus();
  change('#title-music-track', 'rock-red');
  expect(document.activeElement).toBe(control);
  expect(document.querySelector('#music-track').value).toBe('rock-red');
  change('#title-music-blue-track', 'drive');
  change('#title-music-volume', '61', 'input');
  const checkbox = document.querySelector('#title-music-army-tracks');
  checkbox.checked = false;
  checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  expect(document.querySelector('#music-blue-track').disabled).toBe(true);
  expect(document.querySelector('#title-music-blue-track').disabled).toBe(true);
  expect(JSON.parse(dom.window.localStorage.getItem('ministr.music.settings'))).toEqual({
    muted: true,
    volume: 0.61,
    fieldTrack: 'rock-red',
    armyTracks: false,
    blueFieldTrack: 'drive',
  });
  expect(document.querySelector('.music-controls').textContent).toContain(locale === 'en' ? 'Red army / shared track' : '赤軍・共通曲');
});

it('reports storage failure while keeping the current settings and stored preferences', () => {
  const document = launch('en');
  const previous = dom.window.localStorage.getItem('ministr.music.settings');
  const original = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = function (key: string, value: string) {
    if (key === 'ministr.music.settings') throw Error('QuotaExceededError');
    original.call(this, key, value);
  };
  change('#title-music-track', 'rock-red');
  expect(document.querySelector('#music-track').value).toBe('rock-red');
  expect(document.querySelector('#title-music-settings .music-settings-notice').textContent).toContain('Unable to save BGM settings');
  expect(dom.window.localStorage.getItem('ministr.music.settings')).toBe(previous);
});

it('keeps the current game and its recorded rule when changing title BGM', () => {
  const document = launch();
  document.querySelector('#title-training').click();
  document.querySelector('#begin-operation').click();
  document.querySelector('#save').click();
  const before = JSON.parse(dom.window.localStorage.getItem('ministr.save.manual'));
  document.querySelector('#open-title').click();
  change('#title-music-track', 'rock-red');
  document.querySelector('#title-resume').click();
  document.querySelector('#save').click();
  const after = JSON.parse(dom.window.localStorage.getItem('ministr.save.manual'));
  expect(after.gameState).toEqual(before.gameState);
  expect(after.initialState).toEqual(before.initialState);
  expect(after.commands).toEqual(before.commands);
  expect(after.gameState.ruleVersion).toBe(12);
});
