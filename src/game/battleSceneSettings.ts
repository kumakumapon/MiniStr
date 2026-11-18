import type { StorageLike } from './session';

export const BATTLE_SCENE_SETTINGS_KEY = 'ministr.battleScene.settings';
export type BattleSceneMode = 'twoArmy' | 'multiArmy';
export interface BattleSceneSettings {
  twoArmy: boolean;
  multiArmy: boolean;
}
export function parseBattleSceneSettings(raw: string): BattleSceneSettings | undefined {
  try {
    if (raw.length > 128) return;
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.keys(value).length === 2 &&
      'twoArmy' in value &&
      'multiArmy' in value &&
      typeof value.twoArmy === 'boolean' &&
      typeof value.multiArmy === 'boolean'
    )
      return { twoArmy: value.twoArmy, multiArmy: value.multiArmy };
  } catch {
    /* Missing or unavailable preferences use the existing visible default. */
  }
  return undefined;
}
export function loadBattleSceneSettings(storage: StorageLike): BattleSceneSettings {
  try {
    const raw = storage.getItem(BATTLE_SCENE_SETTINGS_KEY);
    const value = raw ? parseBattleSceneSettings(raw) : undefined;
    if (value) return value;
  } catch {
    /* Use visible defaults when storage cannot be read. */
  }
  return { twoArmy: true, multiArmy: true };
}
/** Read-modify-write preserves the other mode's independent preference. */
export function saveBattleSceneSetting(storage: StorageLike, mode: BattleSceneMode, enabled: boolean): boolean {
  if (typeof enabled !== 'boolean' || (mode !== 'twoArmy' && mode !== 'multiArmy')) return false;
  try {
    storage.setItem(BATTLE_SCENE_SETTINGS_KEY, JSON.stringify({ ...loadBattleSceneSettings(storage), [mode]: enabled }));
    return true;
  } catch {
    return false;
  }
}
