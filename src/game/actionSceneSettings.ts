import type { StorageLike } from './session';

export const ACTION_SCENE_SETTINGS_KEY = 'ministr.actionScene.settings';
export type ActionSceneMode = 'twoArmy' | 'multiArmy';
export interface ActionSceneSettings {
  twoArmy: boolean;
  multiArmy: boolean;
}
export function parseActionSceneSettings(raw: string): ActionSceneSettings | undefined {
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
export function loadActionSceneSettings(storage: StorageLike): ActionSceneSettings {
  try {
    const raw = storage.getItem(ACTION_SCENE_SETTINGS_KEY);
    const value = raw ? parseActionSceneSettings(raw) : undefined;
    if (value) return value;
  } catch {
    /* Use visible defaults when storage cannot be read. */
  }
  return { twoArmy: true, multiArmy: true };
}
/** Read-modify-write preserves the other mode's independent preference. */
export function saveActionSceneSetting(storage: StorageLike, mode: ActionSceneMode, enabled: boolean): boolean {
  if (typeof enabled !== 'boolean' || (mode !== 'twoArmy' && mode !== 'multiArmy')) return false;
  try {
    storage.setItem(ACTION_SCENE_SETTINGS_KEY, JSON.stringify({ ...loadActionSceneSettings(storage), [mode]: enabled }));
    return true;
  } catch {
    return false;
  }
}
