import { afterEach, describe, expect, it } from 'vitest';
import { createBrowserStorage } from './storage';
import { ScreenController } from './screenController';
import { formatDate, formatNumber, getLocale, localized, localizeControls, renderLocalePicker, setLocale } from './locale';
import { commandErrorMessage, uiText } from './strings';
import { diagnosticReport } from './buildInfo';
import { lessonProgress, renderLearning } from './learning';
import { createScenarioInitialState, maps } from '../game';
import { createScenarioEditor, saveCustomScenario, scenarioDefinitionToData } from '../game';
import { renderEditorView } from './editorView';
import { EditorHistory } from '../game/editorTools';

afterEach(() => {
  setLocale('ja');
  localStorage.clear();
});
describe('UI boundaries and exclusive screens', () => {
  it('keeps data in memory if the storage getter is denied', () => {
    const storage = createBrowserStorage(() => {
      throw Error('SecurityError');
    });
    expect(storage.persistent).toBe(false);
    storage.setItem('ministr.test', 'one');
    expect(storage.getItem('ministr.test')).toBe('one');
    expect(storage.length).toBe(1);
    expect(storage.key!(0)).toBe('ministr.test');
    expect(storage.key!(1)).toBeNull();
    storage.removeItem('ministr.test');
    expect(storage.getItem('ministr.test')).toBeNull();
  });
  it('uses browser persistence, tracks external changes and blocks stale writes', () => {
    localStorage.setItem('ministr.old', 'saved');
    const storage = createBrowserStorage(() => localStorage);
    expect(storage.persistent).toBe(true);
    expect(storage.getItem('ministr.old')).toBe('saved');
    storage.setItem('ministr.new', 'value');
    expect(localStorage.getItem('ministr.new')).toBe('value');
    localStorage.removeItem('ministr.new');
    expect(storage.getItem('ministr.new')).toBeNull();
    storage.markExternalChange();
    expect(storage.conflicted).toBe(true);
    expect(() => storage.setItem('ministr.old', 'overwritten')).toThrow();
    expect(() => storage.removeItem('ministr.old')).toThrow();
    expect(storage.getItem('ministr.old')).toBe('saved');
  });
  it('never has two active modal screens and ignores closing an inactive one', () => {
    const screens = new ScreenController();
    expect(screens.titleOpen).toBe(true);
    screens.briefingOpen = true;
    expect(screens.titleOpen).toBe(false);
    expect(screens.briefingOpen).toBe(true);
    screens.titleOpen = false;
    expect(screens.current).toBe('briefing');
    screens.campaignMenuOpen = true;
    expect(screens.campaignMenuOpen).toBe(true);
    screens.briefingOpen = false;
    expect(screens.current).toBe('campaign');
    screens.editorOpen = true;
    expect(screens.editorOpen).toBe(true);
    screens.campaignMenuOpen = false;
    expect(screens.current).toBe('editor');
    screens.editorOpen = false;
    expect(screens.current).toBe('battle');
    screens.titleOpen = true;
    expect(screens.titleOpen).toBe(true);
  });
});

describe('locale, learning and user-selected diagnostics', () => {
  it('renders English plural/numeric messages and operation transitions with their arguments intact', () => {
    setLocale('en');
    expect(uiText.campaignDescription(10)).toContain('10 operations');
    expect(uiText.decisionRule(40)).toContain('round 40');
    expect(uiText.sideVictory('Red')).toBe('Red wins');
    expect(uiText.spectateDifficulty('Easy', 'Hard')).toBe('Spectating · Red Easy / Blue Hard');
    expect(uiText.titleBoard(12, 10)).toBe('12×10');
    expect(uiText.titleGold(12000)).toBe('Starting funds 12,000G');
    expect(uiText.titleTurnLimit(undefined)).toBe('No round limit');
    expect(uiText.titleTurnLimit(20)).toBe('20-round limit');
    expect(uiText.spectateTurnLimit(41)).toContain('round 41');
    expect(uiText.spectateTurnEnded('Blue')).toBe('Blue CPU ended its turn.');
    expect(uiText.handoffTitle('Blue')).toBe('Blue’s turn');
  });
  it('renders editor tools and user names as text, across objective types', () => {
    const data = { ...scenarioDefinitionToData(maps[0]!), id: 'editor-ui-test', name: '<img src=x>' };
    saveCustomScenario(localStorage, data);
    const history = new EditorHistory();
    for (const condition of [
      { type: 'hold' as const, positions: [{ x: 0, y: 0 }], turns: 2 },
      { type: 'survive' as const, untilTurn: 3 },
      { type: 'score' as const, target: 5 },
    ]) {
      const editor = { ...createScenarioEditor(), data: { ...data, victoryConditions: [condition] } };
      document.body.innerHTML = renderEditorView(editor, '<notice>', 'rectangle', history);
      expect(document.querySelector('img')).toBeNull();
      expect(document.querySelector('#editor-name')?.getAttribute('value')).toBe('<img src=x>');
      expect(document.querySelector('#editor-paint option:checked')?.getAttribute('value')).toBe('rectangle');
      expect(document.querySelector('#editor-undo')?.hasAttribute('disabled')).toBe(true);
      expect(document.querySelectorAll('.editor-tile')).toHaveLength(data.board.width * data.board.height);
    }
    expect(renderEditorView(createScenarioEditor(), '', 'brush', history)).toContain('editor-start');
  });
  it('switches primary labels, errors, accessible names and numeric/date formatting', () => {
    expect(getLocale()).toBe('ja');
    expect(uiText.titleContinue).toBe('続きから');
    expect(commandErrorMessage('Unit not found')).toContain('ユニット');
    expect(renderLocalePicker()).toContain('value="ja" selected');
    setLocale('en');
    expect(uiText.titleContinue).toBe('Continue');
    expect(uiText.resultScore(1000, 2)).toBe('Destroyed 1,000 / Captured 2');
    expect(commandErrorMessage('Unit not found')).toBe('Unit not found');
    expect(commandErrorMessage('unknown')).toBe('This action could not be completed.');
    expect(formatNumber(12000)).toBe('12,000');
    expect(formatDate('2026-10-02T00:00:00.000Z')).toContain('2026');
    expect(formatDate('invalid')).toBe('Unknown date');
    document.body.innerHTML = '<button aria-label="ターンを終了する">ターン終了</button><textarea>ターン終了</textarea><span class="title-map-name">占領</span>';
    localizeControls(document.body);
    expect(document.querySelector('button')?.textContent).toBe('End turn');
    expect(document.querySelector('button')?.getAttribute('aria-label')).toBe('End the current turn');
    expect(document.querySelector('textarea')?.textContent).toBe('ターン終了');
    expect(document.querySelector('.title-map-name')?.textContent).toBe('占領');
    expect(localized({ caption: '日本語' }, { caption: 'English' }).caption).toBe('English');
    setLocale(null);
    expect(formatDate('invalid')).toBe('日時不明');
    localizeControls(document.body);
    expect(getLocale()).toBe('ja');
  });
  it('provides skippable practice guidance and statistics from actual unit rules', () => {
    const state = createScenarioInitialState(maps[0]!);
    expect(lessonProgress([{ type: 'endTurn' }])).toEqual([false, false, false, true, false, false]);
    const html = renderLearning({ ...state, scenarioId: 'training' }, 'red', [{ type: 'move', unitId: 'r1', destination: { x: 0, y: 2 } }], true);
    expect(html).toContain('✓ 移動');
    expect(html).toContain('毎ターン消費');
    expect(html).toContain('open');
    expect(renderLearning(state, 'red', [], false)).toContain('ユニットを選択');
  });
  it('exports operational metadata without play data, path, URL or user agent', () => {
    const report = JSON.parse(diagnosticReport({ persistent: false, bytes: 123, locale: 'ja', viewport: { width: 360, height: 780 } }));
    expect(report.storageAvailable).toBe(false);
    expect(Object.keys(report).sort()).toEqual(['build', 'generatedAt', 'locale', 'online', 'schemaVersion', 'storageAvailable', 'storageBytes', 'viewport'].sort());
  });
});
