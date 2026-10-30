import { MAX_BACKUP_BYTES } from './backup';
import { parseBoundedJson } from './jsonBoundary';
import { parseSavedGame, saveGameToSlot, writeStorageChanges, type SavedGame, type StorageLike } from './session';
import type { GameResult } from './types';

export interface SaveRecoveryPreview {
  recovered: number;
  rejected: number;
}
const prepared = new WeakMap<SaveRecoveryPreview, SavedGame[]>();

/** Salvage valid matches from a raw save or backup without accepting damaged entries. */
export function previewSaveRecovery(text: string): GameResult<SaveRecoveryPreview> {
  const parsed = parseBoundedJson(text, MAX_BACKUP_BYTES);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'Invalid recovery file.' };
  const entries = 'entries' in value ? value.entries : undefined;
  let candidates: string[];
  if (entries !== undefined) {
    if (!('schemaVersion' in value) || value.schemaVersion !== 1 || !Array.isArray(entries) || entries.length > 256) return { ok: false, error: 'Invalid recovery backup.' };
    const keys = new Set<string>();
    candidates = [];
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || typeof entry[1] !== 'string' || keys.has(entry[0]))
        return { ok: false, error: 'Invalid recovery entry.' };
      keys.add(entry[0]);
      if (/^ministr\.save\.(?:manual|auto|slot\.[a-z0-9][a-z0-9-]{0,47})$/.test(entry[0])) candidates.push(entry[1]);
    }
  } else candidates = [text];
  if (candidates.length > 14) return { ok: false, error: 'Too many recovery matches.' };
  const saves: SavedGame[] = [];
  let rejected = 0;
  for (const raw of candidates) {
    const saved = parseSavedGame(raw);
    if (saved.ok) saves.push(saved.value);
    else rejected++;
  }
  if (!saves.length) return { ok: false, error: 'No valid matches could be recovered. Keep the original file.' };
  const preview = { recovered: saves.length, rejected };
  prepared.set(preview, saves);
  return { ok: true, value: preview };
}

/** Add new slots only. Prepare all writes before touching persistence; never replace existing data. */
export function restoreRecoveredSaves(storage: StorageLike, preview: SaveRecoveryPreview, makeId: () => string): GameResult<void> {
  const saves = prepared.get(preview);
  if (!saves) return { ok: false, error: 'Recovery preview required.' };
  try {
    if (typeof storage.length !== 'number' || !storage.key) return { ok: false, error: 'Storage enumeration required.' };
    const values = new Map<string, string>();
    for (let i = 0; i < (storage.length ?? 0); i++) {
      const key = storage.key?.(i);
      if (key) {
        const raw = storage.getItem(key);
        if (raw !== null) values.set(key, raw);
      }
    }
    const changes = new Map<string, string>();
    const staging: StorageLike = {
      get length() {
        return values.size;
      },
      key: (i) => [...values.keys()][i] ?? null,
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, raw) => {
        values.set(key, raw);
        changes.set(key, raw);
      },
      removeItem: () => {
        throw Error('Recovery cannot delete');
      },
    };
    for (const save of saves) {
      const id = makeId();
      if (values.has(`ministr.save.slot.${id}`)) return { ok: false, error: 'Recovery slot already exists.' };
      const result = saveGameToSlot(staging, id, `Recovered ${save.mapId}`.slice(0, 40), save);
      if (!result.ok) return result;
    }
    return writeStorageChanges(storage, changes);
  } catch {
    return { ok: false, error: 'Recovery failed. Keep the original file.' };
  }
}
