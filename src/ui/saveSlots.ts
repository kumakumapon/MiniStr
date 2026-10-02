import type { SaveSlot, StorageUsage } from '../game';
import { formatDate } from './locale';
import { escapeHtml, formatBytes, uiText } from './strings';

export function renderSaveSlotManager(slots: readonly SaveSlot[], usage: StorageUsage, canSave = true, protectLegacy = false): string {
  const rows = slots.length
    ? slots
        .map(
          (slot) =>
            `<li><div><strong>${escapeHtml(slot.name)}</strong><span>${escapeHtml(slot.mapId)}${slot.mode === 'hotseat' ? ' / 2人対戦' : slot.mode === 'spectate' ? ' / 観戦' : ''} / ${slot.turn}ターン / ${formatBytes(slot.bytes)}</span>${slot.savedAt ? `<time datetime="${escapeHtml(slot.savedAt)}">${escapeHtml(formatDate(slot.savedAt))}</time>` : ''}${slot.error ? `<p role="status">${escapeHtml(slot.error)}</p>` : ''}</div><div><button class="save-action load-save-slot" data-save-slot="${escapeHtml(slot.id)}" ${slot.status === 'corrupt' || slot.status === 'missing' ? 'disabled' : ''}>再開</button><button class="save-action delete-save-slot" data-save-slot="${escapeHtml(slot.id)}" ${protectLegacy && slot.source === 'legacy' ? 'disabled title="観戦中は対局セーブを削除できません"' : ''}>削除</button></div></li>`,
        )
        .join('')
    : '<li class="save-slot-empty">保存済みの対局はありません。</li>';
  return `<section class="save-slot-manager" aria-labelledby="save-slot-title"><div><p class="card-kicker">SAVES</p><h2 id="save-slot-title">${uiText.saveManager}</h2><p>${uiText.storageUsage}: ${formatBytes(usage.bytes)} (${usage.itemCount}件)</p></div>${canSave ? `<button id="save-new-slot" class="save-action">${uiText.saveSlot}</button>` : ''}<div class="backup-actions"><button class="save-action" id="backup-export">全データをバックアップ</button><label class="save-action">バックアップを復元<input id="backup-import" type="file" accept=".json,application/json"></label></div><ol>${rows}</ol>${usage.warning ? `<p class="storage-warning" role="status">${uiText.storageWarning}</p>` : ''}</section>`;
}
