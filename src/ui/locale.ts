import { englishResources } from './english';

export type Locale = 'ja' | 'en';
let locale: Locale = 'ja';
export const getLocale = (): Locale => locale;
export function setLocale(value: string | null): Locale {
  locale = value === 'en' ? 'en' : 'ja';
  return locale;
}
type Localized<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string ? (...args: A) => string : string;
};
export function localized<T extends object>(ja: T, en: Localized<T>): Localized<T> {
  return new Proxy(ja as unknown as Localized<T>, {
    get(target, key: string) {
      return (locale === 'en' ? en : target)[key as keyof T];
    },
  });
}
export const formatNumber = (value: number): string => new Intl.NumberFormat(locale).format(value);
export function formatDate(value: string): string {
  return Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : locale === 'ja'
      ? '日時不明'
      : 'Unknown date';
}

const japaneseCharacters = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const exactEnglish = new Map(englishResources.filter(([source]) => !/\{\d+\}/.test(source)));
const escapeExpression = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const englishFragments = new RegExp(
  [...exactEnglish.keys()]
    .filter((value) => value.length >= 8)
    .sort((a, b) => b.length - a.length)
    .map(escapeExpression)
    .join('|'),
  'gu',
);
const englishTemplates = englishResources
  .filter(([source]) => /\{\d+\}/.test(source))
  .map(([source, english]) => {
    const captures = new Map<string, number>();
    let groups = 0;
    let previousParameter = false;
    const expression = source
      .split(/(\{\d+\})/)
      .map((part, index, parts) => {
        if (/^\{\d+\}$/.test(part)) {
          // Adjacent fields have no observable boundary. Keep their combined text
          // in the first field instead of creating ambiguous backtracking groups.
          captures.set(part, previousParameter ? 0 : ++groups);
          const numeric = /^\s*(?:ターン|部隊|件|点|回|枠|G\b|HP\b)/.test(parts[index + 1] ?? '');
          const capture = previousParameter ? '' : numeric ? '(-?[0-9][0-9,.]*)' : '([\\s\\S]*?)';
          previousParameter = true;
          return capture;
        }
        if (part) previousParameter = false;
        return escapeExpression(part);
      })
      .join('');
    return { expression: new RegExp(`^${expression}$`, 'u'), english, captures, specificity: source.replace(/\{\d+\}/g, '').length };
  })
  .sort((left, right) => right.specificity - left.specificity);

function englishDisplayText(value: string, owned: boolean, depth = 0): string {
  if (!japaneseCharacters.test(value) || value.length > 8192) return value;
  const text = value.trim();
  const exact = exactEnglish.get(text);
  if (exact !== undefined) return value.replace(text, () => exact);
  for (const template of englishTemplates) {
    if (template.specificity < 2) continue;
    const match = template.expression.exec(text);
    if (!match) continue;
    const translated = template.english.replace(/\{\d+\}/g, (parameter) => {
      const index = template.captures.get(parameter);
      const captured = index ? (match[index] ?? '') : '';
      return owned && depth < 6 ? englishDisplayText(captured, true, depth + 1) : captured;
    });
    return value.replace(text, () => translated);
  }
  if (owned && depth < 6) {
    const composed = text.replace(englishFragments, (fragment) => `${exactEnglish.get(fragment)!}${fragment.endsWith('。') ? ' ' : ''}`);
    if (composed !== text) return value.replace(text, () => englishDisplayText(composed, true, depth + 1));
    const bracketed = text.replace(/（([^（）]*)）/g, (_, inside: string) => ` (${englishDisplayText(inside, true, depth + 1)})`);
    if (bracketed !== text) return value.replace(text, () => englishDisplayText(bracketed, true, depth + 1));
    const parts = text.split(/(?=[、・／：\n])|(?= — )/u);
    if (parts.length > 1)
      return value.replace(text, () =>
        parts
          .map((part) => {
            const translated = englishDisplayText(part, true, depth + 1);
            if (translated !== part) return translated;
            const separated = /^([、・／：\n]+| — )([\s\S]+)$/.exec(part);
            return separated
              ? `${separated[1] === '\n' ? '\n' : separated[1] === '：' ? ': ' : separated[1] === ' — ' ? ' — ' : '; '}${englishDisplayText(separated[2]!, true, depth + 1)}`
              : part;
          })
          .join(''),
      );
    const relation = /^(.*?)の(.*?)$/.exec(text);
    if (relation) return value.replace(text, () => `${englishDisplayText(relation[1]!, true, depth + 1)} ${englishDisplayText(relation[2]!, true, depth + 1)}`);
  }
  return value;
}

/** Translate UI copy while leaving interpolated names and identifiers verbatim. */
export const translateText = (value: string): string => (locale === 'en' ? englishDisplayText(value, false) : value);

/** Only for app-owned generated descriptions; never pass user-authored prose. */
export const translateGameText = (value: string): string => (locale === 'en' ? englishDisplayText(value, true) : value);

/** Legacy control aliases; general UI resources also cover dynamic copy. */
const controls: Record<string, string> = {
  基本操作を練習: 'Practice the basics',
  診断情報を保存: 'Download diagnostics',
  戦域: 'Map',
  難易度: 'Difficulty',
  手動セーブ: 'Save game',
  対局セーブ削除: 'Delete match saves',
  '1手戻す': 'Undo',
  JSON取込: 'Import replay',
  ターン終了: 'End turn',
  占領: 'Capture',
  行動終了: 'Wait',
  再開: 'Resume',
  削除: 'Delete',
  全データをバックアップ: 'Back up all data',
  バックアップを復元: 'Restore backup',
  閉じる: 'Close',
  元に戻す: 'Undo',
  やり直す: 'Redo',
  編集: 'Edit',
  複製: 'Duplicate',
  下書きを保存: 'Save draft',
  シナリオを検証: 'Validate scenario',
  保存してこのシナリオで開始: 'Save and start scenario',
  JSONを書き出す: 'Export JSON',
  JSONを反映: 'Import JSON',
  再生: 'Play',
  一時停止: 'Pause',
  '1手送り': 'Step forward',
  '1手戻る': 'Step back',
  リプレイを終了: 'Exit replay',
  リプレイ位置: 'Replay position',
  視点: 'Viewpoint',
  赤軍: 'Red',
  青軍: 'Blue',
  '全体（対局終了後）': 'All (completed match)',
  作戦情報: 'Command panel',
  戦域マップを選択: 'Choose a map',
  CPUの難易度を選択: 'Choose CPU difficulty',
  CPUの行動速度を選択: 'Choose CPU speed',
  ターンを終了する: 'End the current turn',
  現在のターンを終了: 'End the current turn',
  JSONリプレイファイルを選択: 'Choose a JSON replay file',
  盤面の拡大率: 'Board zoom',
  盤面を縮小: 'Zoom out',
  盤面を拡大: 'Zoom in',
  クイック操作: 'Quick actions',
  リプレイ再生コントロール: 'Replay controls',
  リプレイ再生速度: 'Replay speed',
};
export function localizeControls(root: HTMLElement, stableRoot?: HTMLElement | null): void {
  if (locale !== 'en') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node === stableRoot ? NodeFilter.FILTER_REJECT : node.nodeType === Node.TEXT_NODE ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest('textarea, script, style, [data-user-content], .title-map-name, .briefing-copy, .save-slot-manager strong')) continue;
    const text = node.textContent?.trim() ?? '';
    const owned = node.parentElement?.closest('[data-ui-copy]') && !node.parentElement.closest('[data-user-copy]');
    const translated = controls[text] ?? (owned ? translateGameText(text) : translateText(text));
    if (translated !== text) node.textContent = node.textContent!.replace(text, () => translated);
  }
  [root, ...root.querySelectorAll<HTMLElement>('[aria-label], [title], [placeholder], [alt], [label]')].forEach((element) => {
    if (stableRoot && element !== stableRoot && stableRoot.contains(element)) return;
    if (element.closest('[data-user-content]')) return;
    for (const attribute of ['aria-label', 'title', 'placeholder', 'alt', 'label']) {
      if (element.dataset.userAttributes?.split(' ').includes(attribute)) continue;
      const text = element.getAttribute(attribute);
      const owned = element.closest('[data-ui-copy]') && !element.closest('[data-user-copy]');
      if (text) {
        const translated = controls[text] ?? (owned ? translateGameText(text) : translateText(text));
        if (translated !== text) element.setAttribute(attribute, translated);
      }
    }
  });
}
export function renderLocalePicker(): string {
  const label = locale === 'en' ? 'Language' : '言語 / Language';
  return `<label>${label}<select data-locale aria-label="${label}"><option value="ja" ${locale === 'ja' ? 'selected' : ''}>${locale === 'en' ? 'Japanese' : '日本語'}</option><option value="en" ${locale === 'en' ? 'selected' : ''}>English</option></select></label>`;
}
