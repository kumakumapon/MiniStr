import type { GeneratedShare } from '../game/shareLink';
import { localized } from './locale';
import { escapeHtml } from './strings';

const text = localized(
  {
    kicker: 'SHARED LINK',
    title: '共有リンクの戦域を開く',
    lead: '共有リンクで届いた生成条件です。内容を確認してから生成します。',
    generation: '生成バージョン',
    size: 'サイズ',
    sea: '海域量',
    preset: '戦域設定',
    seed: 'seed',
    name: '作戦名',
    saveNote: 'カスタム作戦として追加保存されます。既存の保存データは上書きされません。',
    confirm: '生成して作戦準備へ',
    cancel: 'キャンセル',
    seaName: (sea: string) => ({ none: '海域なし', coast: '海域少なめ', ocean: '海域多め' })[sea] ?? sea,
    presetName: (preset: string) => ({ standard: '標準', frontline: '前線補給・工兵' })[preset] ?? preset,
  },
  {
    kicker: 'SHARED LINK',
    title: 'Open the shared theater',
    lead: 'These generator settings came from a share link. Review them before generating.',
    generation: 'Generator version',
    size: 'Size',
    sea: 'Sea area',
    preset: 'Theater setting',
    seed: 'Seed',
    name: 'Operation name',
    saveNote: 'It is saved as an additional custom operation. Your existing saved data is not overwritten.',
    confirm: 'Generate and prepare the operation',
    cancel: 'Cancel',
    seaName: (sea: string) => ({ none: 'No sea', coast: 'Light sea', ocean: 'Heavy sea' })[sea] ?? sea,
    presetName: (preset: string) => ({ standard: 'Standard', frontline: 'Frontline supply and engineers' })[preset] ?? preset,
  },
);

/** Everything that can sit above the title; the share dialog waits while any of them shows. */
export interface ShareDialogContext {
  hasPending: boolean;
  titleOpen: boolean;
  replayMode: boolean;
  campaignMenuOpen: boolean;
  editorOpen: boolean;
  briefingOpen: boolean;
  gameOverVisible: boolean;
  handoffConcealed: boolean;
  productionMenuOpen: boolean;
  tacticalSceneActive: boolean;
  cpuInProgress: boolean;
}

/** Only one dialog is ever in the page, so the confirmation shows only when nothing else would. */
export function shareDialogVisible(context: ShareDialogContext): boolean {
  return (
    context.hasPending &&
    context.titleOpen &&
    !context.replayMode &&
    !context.campaignMenuOpen &&
    !context.editorOpen &&
    !context.briefingOpen &&
    !context.gameOverVisible &&
    !context.handoffConcealed &&
    !context.productionMenuOpen &&
    !context.tacticalSceneActive &&
    !context.cpuInProgress
  );
}

export interface ShareDialogView {
  share: GeneratedShare;
  /** The deterministic name the saved operation will have. */
  name: string;
  /** Why the last confirmation did not start the operation; announced in place. */
  status: string;
}

/** The confirmation shown before a shared link generates anything. */
export function renderShareLinkDialog(view: ShareDialogView): string {
  const { share } = view;
  const row = (label: string, value: string, user = false) => `<div><dt>${label}</dt><dd${user ? ' data-user-content' : ''}>${escapeHtml(value)}</dd></div>`;
  return (
    `<div class="share-link-overlay" role="dialog" aria-modal="true" aria-labelledby="share-link-title" aria-describedby="share-link-note">` +
    `<section class="share-link-card"><p class="card-kicker">${text.kicker}</p><h2 id="share-link-title" tabindex="-1">${text.title}</h2><p>${text.lead}</p>` +
    `<dl class="share-link-facts">` +
    row(text.generation, `v${share.gen}`) +
    row(text.size, `${share.size}×${share.size - 4}`) +
    row(text.sea, text.seaName(share.sea)) +
    row(text.preset, text.presetName(share.preset)) +
    row(text.seed, share.seed, true) +
    row(text.name, view.name, true) +
    `</dl><p id="share-link-note">${text.saveNote}</p>` +
    `<p id="share-link-status" role="status" data-user-copy>${escapeHtml(view.status)}</p>` +
    `<div class="share-link-actions"><button id="share-link-confirm" class="end-turn">${text.confirm}</button><button id="share-link-cancel" class="save-action">${text.cancel}</button></div>` +
    `</section></div>`
  );
}
