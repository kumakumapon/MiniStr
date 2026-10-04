import { CAMPAIGN_STORAGE_KEY, parseCampaignProgress } from './campaign';
import { parseBoundedJson } from './jsonBoundary';
import { captureCustomScenarioCatalog, CUSTOM_SCENARIOS_KEY, loadCustomScenarios, restoreCustomScenarioCatalog } from './maps';
import { AUTO_SAVE_KEY, MANUAL_SAVE_KEY, MAX_SAVE_SLOTS, parseSavedGame, SAVE_SLOT_INDEX_KEY, SAVE_SLOT_PREFIX, writeStorageChanges, type StorageLike } from './session';
import type { GameResult } from './types';

export const MAX_BACKUP_BYTES = 16_000_000;
export interface BackupPreview {
  createdAt?: string;
  entryCount: number;
  saveCount: number;
  hasScenarios: boolean;
  hasCampaign: boolean;
  removedEntryCount: number;
}
const validatedBackups = new WeakMap<BackupPreview, Map<string, string>>();
const previewStorage: StorageLike = {
  length: 0,
  key: () => null,
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
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
    const text = JSON.stringify({
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      entries: [...appEntries(storage)],
    });
    return new TextEncoder().encode(text).byteLength <= MAX_BACKUP_BYTES ? { ok: true, value: text } : { ok: false, error: 'バックアップ容量が上限を超えています。' };
  } catch {
    return { ok: false, error: 'バックアップを読み出せませんでした。' };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Summarize the replacement set before asking the user to confirm a restore. */
export function previewBackup(storage: StorageLike, text: string): GameResult<BackupPreview> {
  const parsed = parseBoundedJson(text, MAX_BACKUP_BYTES);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries) || value.entries.length > 256) return { ok: false, error: 'バックアップ形式が不正です。' };
  const keys = new Set<string>();
  const entries = new Map<string, string>();
  let saveCount = 0;
  for (const entry of value.entries) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== 'string' ||
      !entry[0].startsWith('ministr.') ||
      typeof entry[1] !== 'string' ||
      entry[1].length > 1_000_000 ||
      keys.has(entry[0])
    )
      return { ok: false, error: 'バックアップの項目が不正です。' };
    keys.add(entry[0]);
    entries.set(entry[0], entry[1]);
    if ((entry[0] === MANUAL_SAVE_KEY || entry[0] === AUTO_SAVE_KEY || entry[0].startsWith(SAVE_SLOT_PREFIX)) && entry[0] !== SAVE_SLOT_INDEX_KEY) saveCount++;
  }
  const validated = restoreBackup(previewStorage, text);
  if (!validated.ok) return validated;
  let removedEntryCount: number;
  try {
    removedEntryCount = [...appEntries(storage).keys()].filter((key) => !keys.has(key)).length;
  } catch {
    return { ok: false, error: '現在の保存項目を読み出せませんでした。' };
  }
  const preview: BackupPreview = {
    ...(typeof value.createdAt === 'string' ? { createdAt: value.createdAt } : {}),
    entryCount: keys.size,
    saveCount,
    hasScenarios: keys.has(CUSTOM_SCENARIOS_KEY),
    hasCampaign: keys.has(CAMPAIGN_STORAGE_KEY),
    removedEntryCount,
  };
  validatedBackups.set(preview, entries);
  return { ok: true, value: preview };
}

/** Validate the complete candidate before the first persistent write. */
export function restoreBackup(storage: StorageLike, source: string | BackupPreview): GameResult<void> {
  let entries: Map<string, string>;
  if (typeof source !== 'string') {
    const prepared = validatedBackups.get(source);
    if (!prepared) return { ok: false, error: 'バックアップの事前検証が必要です。' };
    entries = prepared;
  } else {
    const parsed = parseBoundedJson(source, MAX_BACKUP_BYTES);
    if (!parsed.ok) return parsed;
    const value = parsed.value;
    if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries) || value.entries.length > 256) return { ok: false, error: 'バックアップ形式が不正です。' };
    entries = new Map<string, string>();
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
    const candidate: StorageLike = {
      getItem: (key) => entries.get(key) ?? null,
      setItem: () => {},
      removeItem: () => {},
    };
    const originalCatalog = captureCustomScenarioCatalog();
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
      // Validate legacy saves against the candidate catalog without changing the live catalog.
      restoreCustomScenarioCatalog(originalCatalog);
    }
  }
  try {
    const changes = new Map<string, string | null>([...appEntries(storage).keys()].map((key) => [key, null]));
    for (const entry of entries) changes.set(...entry);
    return writeStorageChanges(storage, changes);
  } catch {
    return { ok: false, error: '復元前のデータを読み出せませんでした。' };
  }
}
