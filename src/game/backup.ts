import { CAMPAIGN_STORAGE_KEY, parseCampaignProgress } from './campaign';
import { parseBoundedJson } from './jsonBoundary';
import { CUSTOM_SCENARIOS_KEY, loadCustomScenarios } from './maps';
import { AUTO_SAVE_KEY, MANUAL_SAVE_KEY, MAX_SAVE_SLOTS, parseSavedGame, SAVE_SLOT_INDEX_KEY, SAVE_SLOT_PREFIX, writeStorageChanges, type StorageLike } from './session';
import type { GameResult } from './types';

export const MAX_BACKUP_BYTES = 16_000_000;
function appEntries(storage: StorageLike): Map<string, string> {
  if (storage.length === undefined || !storage.key) throw Error('Storage enumeration unavailable');
  const result = new Map<string, string>();
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith('ministr.')) {
      const value = storage.getItem(key);
      if (value !== null) result.set(key, value);
    }
  }
  return result;
}

/** Preserve raw corrupt entries too, so recovery never destroys the evidence. */
export function exportBackup(storage: StorageLike): GameResult<string> {
  try {
    const text = JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString(), entries: [...appEntries(storage)] });
    return new TextEncoder().encode(text).byteLength <= MAX_BACKUP_BYTES ? { ok: true, value: text } : { ok: false, error: 'バックアップ容量が上限を超えています。' };
  } catch {
    return { ok: false, error: 'バックアップを読み出せませんでした。' };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
/** Validate the complete candidate before the first persistent write. */
export function restoreBackup(storage: StorageLike, text: string): GameResult<void> {
  const parsed = parseBoundedJson(text, MAX_BACKUP_BYTES);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries) || value.entries.length > 256) return { ok: false, error: 'バックアップ形式が不正です。' };
  const entries = new Map<string, string>();
  for (const entry of value.entries) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== 'string' ||
      !entry[0].startsWith('ministr.') ||
      typeof entry[1] !== 'string' ||
      entry[1].length > 1_000_000 ||
      entries.has(entry[0])
    )
      return { ok: false, error: 'バックアップの項目が不正です。' };
    entries.set(entry[0], entry[1]);
  }
  const candidate: StorageLike = { getItem: (key) => entries.get(key) ?? null, setItem: () => {}, removeItem: () => {} };
  try {
    const catalog = loadCustomScenarios(candidate);
    if (!catalog.ok) return catalog;
    for (const [key, raw] of entries) {
      if (key === CUSTOM_SCENARIOS_KEY) continue;
      if (key === MANUAL_SAVE_KEY || key === AUTO_SAVE_KEY || key.startsWith(SAVE_SLOT_PREFIX)) {
        const saved = parseSavedGame(raw);
        if (!saved.ok) return { ok: false, error: `${key}: ${saved.error}` };
      } else if (key === CAMPAIGN_STORAGE_KEY) {
        const campaign = parseCampaignProgress(raw);
        if (!campaign.ok) return campaign;
      } else if (key === SAVE_SLOT_INDEX_KEY) {
        const index = parseBoundedJson(raw, 32_000);
        if (!index.ok || !Array.isArray(index.value) || index.value.length > MAX_SAVE_SLOTS) return { ok: false, error: 'セーブ索引が不正です。' };
        const ids = new Set<string>();
        for (const slot of index.value) {
          if (
            !isRecord(slot) ||
            typeof slot.id !== 'string' ||
            !/^[a-z0-9][a-z0-9-]{0,47}$/.test(slot.id) ||
            ['manual', 'auto'].includes(slot.id) ||
            ids.has(slot.id) ||
            typeof slot.name !== 'string' ||
            !slot.name.trim() ||
            slot.name.length > 40 ||
            !entries.has(`${SAVE_SLOT_PREFIX}${slot.id}`)
          )
            return { ok: false, error: 'セーブ索引が不正です。' };
          ids.add(slot.id);
        }
      } else if (key === 'ministr.sound.settings') {
        const settings = parseBoundedJson(raw, 1000);
        if (
          !settings.ok ||
          !isRecord(settings.value) ||
          typeof settings.value.muted !== 'boolean' ||
          typeof settings.value.volume !== 'number' ||
          settings.value.volume < 0 ||
          settings.value.volume > 1
        )
          return { ok: false, error: '音量設定が不正です。' };
      } else if (key === 'ministr.confirmEndTurnWithUnacted') {
        if (!['true', 'false'].includes(raw)) return { ok: false, error: '操作設定が不正です。' };
      } else if (key === 'ministr.locale') {
        if (!['ja', 'en'].includes(raw)) return { ok: false, error: '言語設定が不正です。' };
      } else return { ok: false, error: `未対応の保存項目です: ${key}` };
    }
  } finally {
    // Candidate validation must not change the running game's catalog on failure.
    loadCustomScenarios(storage);
  }
  try {
    const changes = new Map<string, string | null>([...appEntries(storage).keys()].map((key) => [key, null]));
    for (const entry of entries) changes.set(...entry);
    return writeStorageChanges(storage, changes);
  } catch {
    return { ok: false, error: '復元前のデータを読み出せませんでした。' };
  }
}
