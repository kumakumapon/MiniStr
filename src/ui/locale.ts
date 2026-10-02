export type Locale = 'ja' | 'en';
let locale: Locale = 'ja';
export const getLocale = (): Locale => locale;
export function setLocale(value: string | null): Locale {
  locale = value === 'en' ? 'en' : 'ja';
  return locale;
}
type Localized<T> = { [K in keyof T]: T[K] extends (...args: infer A) => string ? (...args: A) => string : string };
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
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : locale === 'ja'
      ? '日時不明'
      : 'Unknown date';
}

/** Static controls only: scenario prose, user names, JSON and IDs remain authored content. */
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
export function localizeControls(root: HTMLElement): void {
  if (locale !== 'en') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest('textarea, .title-map-name, .briefing-copy, .save-slot-manager strong')) continue;
    const text = node.textContent?.trim() ?? '';
    if (controls[text]) node.textContent = node.textContent!.replace(text, controls[text]!);
  }
  root.querySelectorAll<HTMLElement>('[aria-label], [title]').forEach((element) => {
    for (const attribute of ['aria-label', 'title']) {
      const text = element.getAttribute(attribute);
      if (text && controls[text]) element.setAttribute(attribute, controls[text]!);
    }
  });
}
export function renderLocalePicker(): string {
  return `<label>Language / 言語<select data-locale aria-label="Language / 言語"><option value="ja" ${locale === 'ja' ? 'selected' : ''}>日本語</option><option value="en" ${locale === 'en' ? 'selected' : ''}>English</option></select></label>`;
}
