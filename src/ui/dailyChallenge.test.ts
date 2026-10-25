import { afterEach, describe, expect, it } from 'vitest';
import { CURRENT_RULE_VERSION } from '../game/types';
import { dailyConditions, DAILY_ERRORS, type DailyRecord } from '../game/dailyChallenge';
import { renderDailyBriefingNote, renderDailyCard, renderDailyResult } from './dailyChallenge';
import { localizeControls, setLocale } from './locale';

const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const conditions = (() => {
  const result = dailyConditions('2026-01-01');
  if (!result.ok) throw Error(result.error);
  return result.value;
})();
const record = (date: string): DailyRecord => ({ date, generation: 'd1', ruleVersion: CURRENT_RULE_VERSION, bestTurns: 14, bestLosses: 2, updatedAt: '2026-01-01T00:00:00.000Z' });
function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}
function expectNoJapanese(root: HTMLElement) {
  localizeControls(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) expect(walker.currentNode.textContent ?? '', root.innerHTML).not.toMatch(japanese);
  for (const element of root.querySelectorAll('[aria-label],[title]'))
    for (const attribute of ['aria-label', 'title']) expect(element.getAttribute(attribute) ?? '', root.innerHTML).not.toMatch(japanese);
}
afterEach(() => {
  setLocale('ja');
  document.body.replaceChildren();
});

describe('daily challenge card', () => {
  it('shows the UTC date, conditions, a single start control and no title-map-card', () => {
    const root = mount(renderDailyCard({ conditions, catalog: { schemaVersion: 1, records: [] }, notice: '', recordsOpen: false }));
    expect(root.querySelectorAll('.title-map-card')).toHaveLength(0);
    expect(root.querySelectorAll('#daily-start')).toHaveLength(1);
    expect(root.querySelector('.daily-card')?.getAttribute('data-daily-date')).toBe('2026-01-01');
    expect(root.querySelector('time')?.textContent).toBe('2026-01-01');
    expect(root.textContent).toContain('UTC基準');
    expect(root.textContent).toContain('日本時間では9時');
    expect(root.textContent).toContain(conditions.code);
    expect(root.textContent).toContain('20×16');
    expect(root.textContent).toContain('固定条件');
    expect(root.textContent).toContain('認証付きのランキングではありません');
    expect(root.textContent).toContain('今日はまだクリアしていません。');
    expect(root.querySelector('#daily-records-reset')).not.toBeNull();
  });
  it('lists dated records with delete controls and shows today best', () => {
    const records = [record('2026-01-01'), record('2025-12-31')];
    const root = mount(renderDailyCard({ conditions, today: records[0], catalog: { schemaVersion: 1, records }, notice: '削除しました', recordsOpen: true }));
    expect(root.querySelector('.daily-best')?.textContent).toBe('最短14ターン・損失2');
    expect([...root.querySelectorAll('[data-daily-delete]')].map((button) => button.getAttribute('data-daily-delete'))).toEqual(['2026-01-01', '2025-12-31']);
    expect(root.querySelector('[data-daily-delete]')?.getAttribute('aria-label')).toBe('2026-01-01の記録を削除');
    expect(root.querySelector('#daily-records')?.hasAttribute('open')).toBe(true);
    expect(root.querySelector('.daily-notice')?.textContent).toBe('削除しました');
    expect(root.querySelector('#title-daily-records-heading')?.textContent).toBe('日替わりチャレンジの記録：2日分');
  });
  it('offers a reset when the stored records cannot be read, without listing anything', () => {
    const root = mount(renderDailyCard({ conditions, notice: 'bad', recordsOpen: true }));
    expect(root.querySelectorAll('[data-daily-delete]')).toHaveLength(0);
    expect(root.querySelector('#daily-records-reset')).not.toBeNull();
    expect(root.textContent).toContain('記録を読み出せませんでした');
  });
  it('escapes notices', () => {
    const root = mount(renderDailyCard({ conditions, catalog: { schemaVersion: 1, records: [] }, notice: '<img src=x onerror=alert(1)>', recordsOpen: false }));
    expect(root.querySelector('img')).toBeNull();
  });
  it('is fully English, including dynamic text', () => {
    setLocale('en');
    const records = [record('2026-01-01')];
    const card = mount(renderDailyCard({ conditions, today: records[0], catalog: { schemaVersion: 1, records }, notice: DAILY_ERRORS.deployment, recordsOpen: true }));
    expectNoJapanese(card);
    expect(card.querySelector('#daily-start')?.textContent?.trim()).toBe("Start today's battlefield →");
    expect(card.querySelector('.daily-best')?.textContent).toBe('Fastest 14 rounds, 2 losses');
    expect(card.querySelector('[data-daily-delete]')?.getAttribute('aria-label')).toBe('Delete the record for 2026-01-01');
    expect(card.textContent).toContain('The date changes at 00:00 UTC (09:00 in Japan).');
    expect(card.querySelector('#title-daily-records-heading')?.textContent).toBe('Daily challenge records: 1 days');
  });
});

describe('daily briefing and result sections', () => {
  it('says whether the deployment will be recorded', () => {
    expect(mount(renderDailyBriefingNote({ conditions, standard: true })).textContent).toContain('標準編成');
    expect(mount(renderDailyBriefingNote({ conditions, standard: false })).querySelector('.daily-warning')?.textContent).toContain('記録されません');
  });
  it('shows the copyable identifier and the outcome, in both languages', () => {
    const view = { code: conditions.code, record: { bestTurns: 9, bestLosses: 0 }, notice: '日替わりチャレンジの最良記録を更新しました。', copyNotice: '識別子をコピーしました。' };
    const ja = mount(renderDailyResult(view));
    expect(ja.querySelector('#daily-code')?.textContent).toBe(conditions.code);
    expect(ja.querySelector('#daily-copy-id')).not.toBeNull();
    expect(ja.textContent).toContain('今回：最短9ターン・損失0');
    setLocale('en');
    const en = mount(renderDailyResult(view));
    expectNoJapanese(en);
    expect(en.textContent).toContain('This match: 9 rounds, 0 losses');
    expect(en.textContent).toContain('Copied the ID.');
    for (const [name, message] of Object.entries(DAILY_ERRORS)) {
      const section = mount(renderDailyResult({ code: conditions.code, notice: message, copyNotice: '' }));
      expectNoJapanese(section);
      expect(section.textContent, name).not.toBe('');
    }
  });
});
