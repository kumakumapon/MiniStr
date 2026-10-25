import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GeneratedShare } from '../game/shareLink';
import { setLocale, localizeControls } from './locale';
import { renderShareLinkDialog, shareDialogVisible, type ShareDialogContext } from './shareLinkDialog';

const share: GeneratedShare = { gen: 3, size: 24, sea: 'ocean', preset: 'frontline', seed: 'Alpha-9' };
const mount = (html: string) => {
  document.body.innerHTML = `<div id="app">${html}</div>`;
  return document.querySelector<HTMLElement>('#app')!;
};

beforeEach(() => setLocale('ja'));
afterEach(() => {
  setLocale('ja');
  document.body.innerHTML = '';
});

describe('share link dialog markup', () => {
  it('is one labelled modal dialog with the conditions, the save note and two buttons', () => {
    mount(renderShareLinkDialog({ share, name: '前線補給・工兵 Alpha-9（24×20）', status: '' }));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('共有リンクの戦域を開く');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe('カスタム作戦として追加保存されます。既存の保存データは上書きされません。');
    const facts = [...dialog.querySelectorAll('dl > div')].map((row) => `${row.querySelector('dt')!.textContent}:${row.querySelector('dd')!.textContent}`);
    expect(facts).toEqual(['生成バージョン:v3', 'サイズ:24×20', '海域量:海域多め', '戦域設定:前線補給・工兵', 'seed:Alpha-9', '作戦名:前線補給・工兵 Alpha-9（24×20）']);
    expect([...dialog.querySelectorAll('button')].map((button) => [button.id, button.textContent])).toEqual([
      ['share-link-confirm', '生成して作戦準備へ'],
      ['share-link-cancel', 'キャンセル'],
    ]);
    // No name field: the operation takes the same deterministic name the title form gives it.
    expect(dialog.querySelector('input, textarea, select')).toBeNull();
  });

  it('announces a refusal in a status region that is always present', () => {
    mount(renderShareLinkDialog({ share, name: 'x', status: '' }));
    const status = document.querySelector('#share-link-status')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('');
    mount(renderShareLinkDialog({ share, name: 'x', status: '保存できません' }));
    expect(document.querySelector('#share-link-status')!.textContent).toBe('保存できません');
  });

  it('escapes the seed, the name and the status instead of inserting markup', () => {
    const hostile = '<img src=x onerror=alert(1)><script>boom()</script>';
    mount(renderShareLinkDialog({ share: { ...share, seed: hostile }, name: hostile, status: hostile }));
    expect(document.querySelector('#app img, #app script')).toBeNull();
    expect(document.querySelector('#share-link-status')!.textContent).toBe(hostile);
    expect([...document.querySelectorAll('dd')].map((dd) => dd.textContent)).toContain(hostile);
  });

  it('shows every sea and preset by name and the board as width by height', () => {
    for (const [sea, label] of [
      ['none', '海域なし'],
      ['coast', '海域少なめ'],
      ['ocean', '海域多め'],
    ] as const) {
      mount(renderShareLinkDialog({ share: { ...share, sea, size: 16 }, name: 'n', status: '' }));
      const text = document.querySelector('dl')!.textContent!;
      expect(text).toContain(label);
      expect(text).toContain('16×12');
    }
    mount(renderShareLinkDialog({ share: { ...share, gen: 2, preset: 'standard' }, name: 'n', status: '' }));
    expect(document.querySelector('dl')!.textContent).toContain('標準');
  });

  it('is fully English in the English locale, with no Japanese left after translation', () => {
    setLocale('en');
    const app = mount(renderShareLinkDialog({ share, name: 'Frontline Alpha-9 (24×20)', status: '' }));
    localizeControls(app);
    expect(app.textContent).not.toMatch(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
    expect(app.querySelector('#share-link-confirm')!.textContent).toBe('Generate and prepare the operation');
    expect(app.querySelector('#share-link-cancel')!.textContent).toBe('Cancel');
    expect(app.textContent).toContain('Your existing saved data is not overwritten.');
  });
});

describe('share link dialog visibility', () => {
  const open: ShareDialogContext = {
    hasPending: true,
    titleOpen: true,
    replayMode: false,
    campaignMenuOpen: false,
    editorOpen: false,
    briefingOpen: false,
    gameOverVisible: false,
    handoffConcealed: false,
    productionMenuOpen: false,
    tacticalSceneActive: false,
    cpuInProgress: false,
  };

  it('shows when a share is pending and nothing else is on screen', () => {
    expect(shareDialogVisible(open)).toBe(true);
  });

  it('waits for every other screen and overlay, one at a time', () => {
    const blockers: Partial<ShareDialogContext>[] = [
      { hasPending: false },
      { titleOpen: false },
      { replayMode: true },
      { campaignMenuOpen: true },
      { editorOpen: true },
      { briefingOpen: true },
      { gameOverVisible: true },
      { handoffConcealed: true },
      { productionMenuOpen: true },
      { tacticalSceneActive: true },
      { cpuInProgress: true },
    ];
    for (const blocker of blockers) expect(shareDialogVisible({ ...open, ...blocker }), JSON.stringify(blocker)).toBe(false);
  });
});
