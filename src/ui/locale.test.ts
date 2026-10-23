import { afterEach, describe, expect, it } from 'vitest';
import { englishResources } from './english';
import { getLocale, localizeControls, renderLocalePicker, setLocale, translateGameText, translateText } from './locale';
import { rankNames, unitTokens } from './labels';

const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
afterEach(() => {
  setLocale('ja');
  document.body.replaceChildren();
});

describe('complete English display resources', () => {
  it('provides English text and preserves every template argument', () => {
    setLocale('en');
    for (const [source, english] of englishResources) {
      expect(english, source).not.toMatch(japanese);
      expect(new Set(english.match(/\{\d+\}/g)), source).toEqual(new Set(source.match(/\{\d+\}/g)));
      if (!/\{\d+\}/.test(source)) expect(translateText(source), source).toBe(english);
    }
  });

  it('translates notifications and dialogs without translating interpolated user names', () => {
    setLocale('en');
    for (const name of ['占領', '丘の部隊', '<img src=x> $& $1']) {
      const translated = translateText(`「${name}」にセーブしました。`);
      expect(translated).toBe(`Saved as "${name}".`);
      expect(translateText(translated)).toBe(translated);
    }
    expect(translateText('未行動の自軍ユニットが 12 部隊あります。ターンを終了しますか？')).toBe('12 friendly units have not acted. End the turn?');
    expect(translateText('編成予算を2000G超過しています。')).toBe('Deployment exceeds the budget by 2000G.');
    expect(translateText('ターン終了')).toBe('End turn');
  });

  it('handles composed app copy and numeric phrases without consuming their prefixes', () => {
    setLocale('en');
    const samples = [
      'Headquarters（自軍）、占領値 不明、未索敵',
      '目標：16ターン以内',
      'OPEN · 第1戦域・補給線の確立',
      '味方損失2以下',
      'RedのInfantry、耐久 100',
      '単体作戦の戦績・チャレンジ：3条件',
    ];
    for (const sample of samples) expect(translateGameText(sample), sample).not.toMatch(japanese);
    expect(translateText('目標：16ターン以内')).toBe('目標：16ターン以内');
    expect(translateGameText('目標：16ターン以内')).toContain('16');
    expect(translateGameText('独自の説明'.repeat(3000))).toBe('独自の説明'.repeat(3000));
  });

  it('covers text and accessible attributes while protecting authored fields and JSON', () => {
    setLocale('en');
    document.body.innerHTML =
      '<button title="ターン終了" aria-label="ターンを終了する">ターン終了</button><input value="占領" placeholder="作戦名"><optgroup label="組み込み"></optgroup><img alt="赤軍司令官の肖像"><p data-user-content title="占領">占領</p><textarea>占領</textarea><p data-ui-copy>赤軍の編成（7枠）</p><p data-ui-copy data-user-copy>「占領」にセーブしました。</p><div data-user-attributes="aria-label" aria-label="丘の作戦"></div>';
    localizeControls(document.body);
    expect(document.querySelector('button')?.textContent).toBe('End turn');
    expect(document.querySelector('button')?.getAttribute('aria-label')).toBe('End the current turn');
    expect(document.querySelector('input')?.getAttribute('placeholder')).toBe('Operation name');
    expect(document.querySelector('input')?.value).toBe('占領');
    expect(document.querySelector('optgroup')?.label).toBe('Built-in');
    expect(document.querySelector('img')?.alt).toBe('Portrait of the Red commander');
    expect(document.querySelector('[data-user-content]')?.textContent).toBe('占領');
    expect(document.querySelector('textarea')?.value).toBe('占領');
    expect(document.querySelector('[data-ui-copy]')?.textContent).toBe('Red deployment (7 slots)');
    expect(document.querySelector('[data-user-copy]')?.textContent).toBe('Saved as "占領".');
    expect(document.querySelector('[data-user-attributes]')?.getAttribute('aria-label')).toBe('丘の作戦');
  });

  it('keeps Japanese copy intact and switches symbols, ranks and the language picker', () => {
    expect(getLocale()).toBe('ja');
    expect(translateText('ターン終了')).toBe('ターン終了');
    expect(rankNames[1]).toBe('古参');
    expect(unitTokens.infantry).toBe('歩');
    setLocale('en');
    expect(renderLocalePicker()).not.toMatch(japanese);
    expect(rankNames[1]).toBe('Veteran');
    expect(Object.values(unitTokens).join('')).not.toMatch(japanese);
    expect(new Set(Object.values(unitTokens)).size).toBe(Object.values(unitTokens).length);
    setLocale('ja');
    expect(rankNames[1]).toBe('古参');
    expect(unitTokens.infantry).toBe('歩');
    document.body.innerHTML = '<button>ターン終了</button>';
    localizeControls(document.body);
    expect(document.body.textContent).toBe('ターン終了');
  });
});
