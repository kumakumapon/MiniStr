import { isResearchKey, parseResearch } from './research';
import { isFourArmySaveKey, parseFourArmySpectatorSave, verifyFourArmySpectatorSaveAsync, FOUR_ARMY_FILE_BYTES } from './fourArmySpectatorSave';
import { MUSIC_SETTINGS_KEY, parseMusicSettings } from './musicSettings';
import { CAMPAIGN_STORAGE_KEY, parseCampaignProgress } from './campaign';
import { DAILY_RECORDS_KEY, parseDailyRecords } from './dailyChallenge';
import { DEPLOYMENT_PRESETS_KEY, parseDeploymentPresets } from './deploymentPresets';
import { OPERATION_RECORDS_KEY, parseOperationRecords } from './operationRecords';
import { parseBoundedJson } from './jsonBoundary';
import { captureCustomScenarioCatalog, CUSTOM_SCENARIOS_KEY, loadCustomScenarios, restoreCustomScenarioCatalog } from './maps';
import { AUTO_SAVE_KEY, MANUAL_SAVE_KEY, MAX_SAVE_SLOTS, parseSavedGame, SAVE_SLOT_INDEX_KEY, SAVE_SLOT_PREFIX, writeStorageChanges, type StorageLike } from './session';
import type { GameResult } from './types';

export const MAX_BACKUP_BYTES = 40_000_000;
export interface BackupPreview {
  createdAt?: string;
  entryCount: number;
  saveCount: number;
  hasScenarios: boolean;
  hasCampaign: boolean;
  /** Present only when the backup carries daily challenge records, which versions before #230 reject. */
  hasDaily?: boolean;
  removedEntryCount: number;
}
const validatedBackups = new WeakMap<BackupPreview, Map<string, string>>();
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

function inspectBackup(text: string): GameResult<{ entries: Map<string, string>; createdAt?: string }> {
  const parsed = parseBoundedJson(text, MAX_BACKUP_BYTES);
  if (!parsed.ok) return parsed;
  const v = parsed.value;
  if (!isRecord(v) || v.schemaVersion !== 1 || !Array.isArray(v.entries) || v.entries.length > 256) return { ok: false, error: 'バックアップ形式が不正です。' };
  const entries = new Map<string, string>();
  for (const e of v.entries) {
    if (
      !Array.isArray(e) ||
      e.length !== 2 ||
      typeof e[0] !== 'string' ||
      !e[0].startsWith('ministr.') ||
      typeof e[1] !== 'string' ||
      e[1].length > (isFourArmySaveKey(e[0]) ? FOUR_ARMY_FILE_BYTES : 1_000_000) ||
      entries.has(e[0])
    )
      return { ok: false, error: 'バックアップの項目が不正です。' };
    entries.set(e[0], e[1]);
  }
  const valid = validateLegacyEntries(entries);
  if (!valid.ok) return valid;
  return { ok: true, value: { entries, ...(typeof v.createdAt === 'string' ? { createdAt: v.createdAt } : {}) } };
}
function validateLegacyEntries(entries: Map<string, string>): GameResult<void> {
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
      } else if (isResearchKey(key)) {
        const study = parseResearch(raw);
        if (!study.ok) return { ok: false, error: `${key}: ${study.error}` };
      } else if (isFourArmySaveKey(key)) {
        continue;
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
      } else if (key === DEPLOYMENT_PRESETS_KEY) {
        const presets = parseDeploymentPresets(raw);
        if (!presets.ok) return presets;
      } else if (key === OPERATION_RECORDS_KEY) {
        const records = parseOperationRecords(raw);
        if (!records.ok) return records;
      } else if (key === DAILY_RECORDS_KEY) {
        const daily = parseDailyRecords(raw);
        if (!daily.ok) return daily;
      } else if (key === MUSIC_SETTINGS_KEY) {
        if (!parseMusicSettings(raw)) return { ok: false, error: 'BGM設定が不正です。' };
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
  return { ok: true, value: undefined };
}
function makePreview(storage: StorageLike, candidate: { entries: Map<string, string>; createdAt?: string }): GameResult<BackupPreview> {
  try {
    const { entries, createdAt } = candidate,
      keys = new Set(entries.keys());
    const preview: BackupPreview = {
      ...(createdAt === undefined ? {} : { createdAt }),
      entryCount: keys.size,
      saveCount: [...keys].filter((k) => ((k === MANUAL_SAVE_KEY || k === AUTO_SAVE_KEY || k.startsWith(SAVE_SLOT_PREFIX)) && k !== SAVE_SLOT_INDEX_KEY) || isFourArmySaveKey(k))
        .length,
      hasScenarios: keys.has(CUSTOM_SCENARIOS_KEY),
      hasCampaign: keys.has(CAMPAIGN_STORAGE_KEY),
      ...(keys.has(DAILY_RECORDS_KEY) ? { hasDaily: true } : {}),
      removedEntryCount: [...appEntries(storage).keys()].filter((k) => !keys.has(k)).length,
    };
    validatedBackups.set(preview, entries);
    return { ok: true, value: preview };
  } catch {
    return { ok: false, error: '現在の保存項目を読み出せませんでした。' };
  }
}
export function previewBackup(storage: StorageLike, text: string): GameResult<BackupPreview> {
  const inspected = inspectBackup(text);
  if (!inspected.ok) return inspected;
  for (const [key, raw] of inspected.value.entries)
    if (isFourArmySaveKey(key)) {
      const result = parseFourArmySpectatorSave(raw);
      if (!result.ok) return { ok: false, error: `${key}: ${result.error}` };
    }
  return makePreview(storage, inspected.value);
}
/** Legacy candidates finish in one catalog transaction, before any asynchronous four-army replay. */
export async function previewBackupAsync(storage: StorageLike, text: string, current: () => boolean = () => true): Promise<GameResult<BackupPreview> | undefined> {
  if (!current()) return;
  const inspected = inspectBackup(text);
  if (!inspected.ok) return inspected;
  for (const [key, raw] of inspected.value.entries)
    if (isFourArmySaveKey(key)) {
      const result = await verifyFourArmySpectatorSaveAsync(raw, current);
      if (!result) return;
      if (!result.ok) return { ok: false, error: `${key}: ${result.error}` };
    }
  return current() ? makePreview(storage, inspected.value) : undefined;
}
/** A prepared preview is branded locally and keeps its verified replacement set private. */
export function restoreBackup(storage: StorageLike, source: string | BackupPreview): GameResult<void> {
  let entries: Map<string, string>;
  if (typeof source === 'string') {
    const preview = previewBackup(storage, source);
    if (!preview.ok) return preview;
    entries = validatedBackups.get(preview.value)!;
  } else {
    const prepared = validatedBackups.get(source);
    if (!prepared) return { ok: false, error: 'バックアップの事前検証が必要です。' };
    entries = prepared;
  }

  try {
    const changes = new Map<string, string | null>([...appEntries(storage).keys()].map((key) => [key, null]));
    for (const entry of entries) changes.set(...entry);
    return writeStorageChanges(storage, changes);
  } catch {
    return { ok: false, error: '復元前のデータを読み出せませんでした。' };
  }
}
