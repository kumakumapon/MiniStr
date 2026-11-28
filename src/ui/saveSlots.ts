import type { SaveSlot, StorageUsage } from '../game';
import { formatDate, getLocale, translateText } from './locale';
import { escapeHtml, formatBytes, uiText } from './strings';

function importControl(id: string, label: string): string {
  return `<button type="button" class="save-action" id="choose-${id}" data-save-file="${id}">${label}</button><input id="${id}" type="file" accept=".json,application/json" hidden>`;
}

export function renderSaveSlotManager(slots: readonly SaveSlot[], usage: StorageUsage, canSave = true, protectLegacy = false): string {
  const rows = slots.length
    ? slots
        .map(
          (slot) =>
            `<li><div><strong>${escapeHtml(slot.source === 'legacy' ? translateText(slot.name) : slot.name)}</strong><span>${escapeHtml(slot.mapId)}${slot.mode === 'hotseat' ? (getLocale() === 'en' ? ' / Two players' : ' / 2人対戦') : slot.mode === 'spectate' ? (getLocale() === 'en' ? ' / Spectating' : ' / 観戦') : ''} / ${getLocale() === 'en' ? `round ${Number(slot.turn)}` : `${Number(slot.turn)}ターン`} / ${formatBytes(slot.bytes)}</span>${slot.savedAt ? `<time datetime="${escapeHtml(slot.savedAt)}">${escapeHtml(formatDate(slot.savedAt))}</time>` : ''}${slot.error ? `<p role="status">${escapeHtml(slot.error)}</p>` : ''}</div><div><button class="save-action load-save-slot" data-save-slot="${escapeHtml(slot.id)}" ${slot.status === 'corrupt' || slot.status === 'missing' ? 'disabled' : ''}>再開</button><button class="save-action export-save-slot" data-save-slot="${escapeHtml(slot.id)}" ${slot.status === 'missing' ? 'disabled' : ''}>${getLocale() === 'en' ? 'Export raw save' : '元データを書き出す'}</button><button class="save-action delete-save-slot" data-save-slot="${escapeHtml(slot.id)}" ${protectLegacy && slot.source === 'legacy' ? 'disabled title="観戦中は対局セーブを削除できません"' : ''}>削除</button></div></li>`,
        )
        .join('')
    : '<li class="save-slot-empty">保存済みの対局はありません。</li>';
  return `<section class="save-slot-manager" aria-labelledby="save-slot-title"><div><p class="card-kicker">SAVES</p><h2 id="save-slot-title">${uiText.saveManager}</h2><p>${uiText.storageUsage}: ${formatBytes(usage.bytes)} (${Number(usage.itemCount)}件)</p></div>${canSave ? `<button id="save-new-slot" class="save-action">${uiText.saveSlot}</button>` : ''}<div class="backup-actions"><button class="save-action" id="backup-export">全データをバックアップ</button>${importControl('backup-import', getLocale() === 'en' ? 'Choose a backup to restore' : '復元するバックアップを選ぶ')}${importControl('save-recovery-import', getLocale() === 'en' ? 'Choose a file to recover matches' : '対局を救出するファイルを選ぶ')}</div><p>${getLocale() === 'en' ? 'Recovery adds valid matches as new slots. Damaged data is retained; export it before deleting.' : '救出は正常な対局を新しいスロットへ追加します。破損データは残るため、削除前に書き出してください。'}</p><ol>${rows}</ol>${usage.warning ? `<p class="storage-warning" role="status">${uiText.storageWarning}</p>` : ''}</section>`;
}
